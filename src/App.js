import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Filter,
  X,
  AlertCircle,
  Database,
  RefreshCw,
  MessageCircle,
  Send,
  Minimize2,
  Mail,
} from 'lucide-react';

export default function ClientDatabase() {
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConfig, setShowConfig] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);

  // Airtable configuration
  const [config, setConfig] = useState({
    apiKey: '',
    baseId: '',
    tableName: '',
  });

  // Filter states
  const [filters, setFilters] = useState({});
  const [availableFilters, setAvailableFilters] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

  // Chat states
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [openaiKey, setOpenaiKey] = useState('');
  const [showOpenAIConfig, setShowOpenAIConfig] = useState(false);
  const chatEndRef = useRef(null);

  // Email campaign states
  const [emailCampaign, setEmailCampaign] = useState(null);
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  // Scroll to bottom of chat
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  // Fetch clients from Airtable
  const fetchClients = async () => {
    if (!config.apiKey || !config.baseId || !config.tableName) {
      setError('Please configure all Airtable settings');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(
          config.tableName,
        )}`,
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();
      setClients(data.records);
      setFilteredClients(data.records);

      if (data.records.length > 0) {
        const fields = Object.keys(data.records[0].fields);
        setAvailableFilters(fields);
      }

      setShowConfig(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Extract emails from filtered clients
  const extractEmails = () => {
    const emails = [];
    filteredClients.forEach((client) => {
      const fields = client.fields;
      const emailField = Object.keys(fields).find(
        (key) =>
          key.toLowerCase().includes('email') ||
          key.toLowerCase() === 'e-mail',
      );
      if (emailField && fields[emailField]) {
        emails.push({
          email: fields[emailField],
          name:
            fields.Name ||
            fields.name ||
            fields['First Name'] ||
            'Client',
          clientData: fields,
        });
      }
    });
    return emails;
  };

  // Extract specific client names from prompt
  const extractClientNamesFromPrompt = (prompt) => {
    const lowerPrompt = prompt.toLowerCase();
    const clientNames = [];
    
    // Check each client's name against the prompt
    filteredClients.forEach((client) => {
      const fields = client.fields;
      const name = fields.Name || fields.name || fields['First Name'] || '';
      if (name && lowerPrompt.includes(name.toLowerCase())) {
        clientNames.push(name);
      }
    });
    
    return clientNames;
  };

  // Generate email campaign
  const generateEmailCampaign = async (prompt) => {
    if (!openaiKey) {
      setShowOpenAIConfig(true);
      return null;
    }

    setChatLoading(true);

    try {
      // Check if user specified specific clients
      const specifiedNames = extractClientNamesFromPrompt(prompt);
      let recipients = extractEmails();
      
      // Filter recipients if specific names were mentioned
      if (specifiedNames.length > 0) {
        recipients = recipients.filter(r => 
          specifiedNames.some(name => r.name.toLowerCase().includes(name.toLowerCase()))
        );
      }

      if (recipients.length === 0) {
        throw new Error(
          'No email addresses found for the specified clients. Make sure your table has an email field.',
        );
      }

      const systemMessage = {
        role: 'system',
        content: `You are an expert email copywriter. Generate professional, personalized email content based on the user's request. Return ONLY a JSON object with this exact structure:
{
  "subject": "Email subject line",
  "body": "Email body content",
  "usePersonalization": true/false
}

The body should be professional, engaging, and appropriate for the context. If usePersonalization is true, use {{name}} as a placeholder where the recipient's name should appear.`,
      };

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              systemMessage,
              {
                role: 'user',
                content: `Generate an email for: ${prompt}\n\nRecipient count: ${recipients.length}`,
              },
            ],
            max_tokens: 1500,
            temperature: 0.7,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || 'Failed to generate email',
        );
      }

      const data = await response.json();
      let emailContent = data.choices[0].message.content;

      // Clean up the response - remove markdown code blocks if present
      emailContent = emailContent
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const emailData = JSON.parse(emailContent);

      setEmailCampaign({
        subject: emailData.subject,
        body: emailData.body,
        recipients: recipients,
        usePersonalization: emailData.usePersonalization,
      });

      setShowEmailPreview(true);

      return {
        role: 'assistant',
        content: `✅ Email campaign created!\n\n📧 Recipients: ${recipients.length}\n📝 Subject: ${emailData.subject}\n\nClick "Preview Campaign" below to review and send.`,
        showPreviewButton: true,
      };
    } catch (err) {
      throw new Error(`Failed to generate email: ${err.message}`);
    } finally {
      setChatLoading(false);
    }
  };

  // Send emails via mailto link
  const sendEmails = async () => {
    if (!emailCampaign) return;

    try {
      // Prepare recipients list
      const toList = emailCampaign.recipients.map(r => r.email).join(',');
      
      // Prepare body - use first recipient's name for personalization preview
      let emailBody = emailCampaign.body;
      if (emailCampaign.usePersonalization && emailCampaign.recipients.length > 0) {
        // Note in body about personalization
        emailBody = `[Note: This template uses {{name}} for personalization. Replace with actual names when sending individually]\n\n${emailBody}`;
      }
      
      // Encode subject and body for URL
      const subject = encodeURIComponent(emailCampaign.subject);
      const body = encodeURIComponent(emailBody);
      
      // Create mailto link
      const mailtoLink = `mailto:${toList}?subject=${subject}&body=${body}`;
      
      // Open default email client
      window.location.href = mailtoLink;
      
      // Show success message
      alert(`Opening email client with ${emailCampaign.recipients.length} recipients...`);
      
    } catch (err) {
      alert(`Error opening email client: ${err.message}`);
    }
  };

  // Send message to OpenAI (chat)
  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    if (!openaiKey) {
      setShowOpenAIConfig(true);
      return;
    }

    const userMessage = chatInput.trim();
    setChatInput('');

    const newMessages = [
      ...chatMessages,
      { role: 'user', content: userMessage },
    ];
    setChatMessages(newMessages);
    setChatLoading(true);

    try {
      const lower = userMessage.toLowerCase();
      const isEmailRequest =
        lower.includes('email') ||
        lower.includes('send') ||
        lower.includes('campaign');

      if (
        isEmailRequest &&
        (lower.includes('generate') ||
          lower.includes('create') ||
          lower.includes('send to') ||
          lower.includes('write'))
      ) {
        const emailResponse = await generateEmailCampaign(userMessage);
        if (emailResponse) {
          setChatMessages([...newMessages, emailResponse]);
        }
        return;
      }

      const dataContext = {
        totalClients: clients.length,
        filteredClients: filteredClients.length,
        availableFields: availableFilters,
        sampleData: clients.slice(0, 3).map((c) => c.fields),
      };

      const systemMessage = {
        role: 'system',
        content: `You are a helpful assistant for a client database with email campaign capabilities. 

Current context:
- Total clients in database: ${dataContext.totalClients}
- Currently filtered/visible clients: ${dataContext.filteredClients}
- Available fields: ${dataContext.availableFields.join(', ')}

Capabilities:
1. Answer questions about the database and statistics
2. Generate email campaigns for the currently filtered clients

For email campaigns: If the user wants to send emails to clients, you can generate an email campaign. They should specify what type of email they want (e.g., "Generate a promotional email about our new product" or "Create a follow-up email" or "Write a newsletter").

When they ask about email campaigns, explain that you can generate emails for the ${dataContext.filteredClients} currently filtered clients.`,
      };

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [systemMessage, ...newMessages],
            max_tokens: 1000,
            temperature: 0.7,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message ||
            'Failed to get response from OpenAI',
        );
      }

      const data = await response.json();
      const assistantMessage = data.choices[0].message.content;

      setChatMessages([
        ...newMessages,
        { role: 'assistant', content: assistantMessage },
      ]);
    } catch (err) {
      setChatMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `Error: ${err.message}. Please check your OpenAI API key and try again.`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  // Apply search and filters
  useEffect(() => {
    let results = [...clients];

    if (searchTerm) {
      results = results.filter((client) =>
        Object.values(client.fields).some((value) =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase()),
        ),
      );
    }

    Object.entries(filters).forEach(([field, value]) => {
      if (value) {
        results = results.filter((client) => {
          const fieldValue = client.fields[field];
          return String(fieldValue || '')
            .toLowerCase()
            .includes(value.toLowerCase());
        });
      }
    });

    setFilteredClients(results);
  }, [searchTerm, filters, clients]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const clearFilters = () => {
    setFilters({});
    setSearchTerm('');
  };

  // CONFIG SCREEN
  if (showConfig) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <Database className="w-8 h-8 text-indigo-600" />
              <h1 className="text-3xl font-bold text-gray-800">
                Configure Airtable Connection
              </h1>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) =>
                    setConfig({ ...config, apiKey: e.target.value })
                  }
                  placeholder="patXXXXXXXXXXXXXX.XXXXXXXXXXXXXXX"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none transition"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get your API key from Airtable Account Settings → API
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Base ID
                </label>
                <input
                  type="text"
                  value={config.baseId}
                  onChange={(e) =>
                    setConfig({ ...config, baseId: e.target.value })
                  }
                  placeholder="appXXXXXXXXXXXXXX"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none transition"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Found in your Airtable base URL
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Table ID
                </label>
                <input
                  type="text"
                  value={config.tableName}
                  onChange={(e) =>
                    setConfig({ ...config, tableName: e.target.value })
                  }
                  placeholder="tblXXXXXXXXXXXXXX"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none transition"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use the table ID (e.g., tblJvG4VJliD3bAZj) from your
                  Airtable URL
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                </div>
              )}

              <button
                onClick={fetchClients}
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect to Airtable'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MAIN APP
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Database className="w-8 h-8 text-indigo-600" />
              <h1 className="text-3xl font-bold text-gray-800">
                Client Database
              </h1>
            </div>
            <button
              onClick={() => setShowConfig(true)}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Change Connection
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search clients..."
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none transition"
            />
          </div>

          {/* Filter Controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              <Filter className="w-4 h-4" />
              Filters
              {Object.values(filters).filter((v) => v).length > 0 && (
                <span className="bg-indigo-600 text-white text-xs px-2 py-1 rounded-full">
                  {Object.values(filters).filter((v) => v).length}
                </span>
              )}
            </button>

            {(searchTerm ||
              Object.values(filters).some((v) => v)) && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800 transition"
              >
                <X className="w-4 h-4" />
                Clear all
              </button>
            )}

            <button
              onClick={fetchClients}
              className="flex items-center gap-2 px-4 py-2 text-indigo-600 hover:text-indigo-800 transition ml-auto"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableFilters.map((field) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field}
                  </label>
                  <input
                    type="text"
                    value={filters[field] || ''}
                    onChange={(e) =>
                      handleFilterChange(field, e.target.value)
                    }
                    placeholder={`Filter by ${field}...`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-indigo-500 focus:outline-none text-sm"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Results Count */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-gray-600">
            Showing {filteredClients.length} of {clients.length} clients
          </span>
          {filteredClients.length > 0 && (
            <button
              onClick={() => {
                setShowChat(true);
                setChatMessages([]);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition text-sm font-medium"
            >
              <Mail className="w-4 h-4" />
              Create Email Campaign
            </button>
          )}
        </div>

        {/* Client Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.map((client) => (
            <div
              key={client.id}
              onClick={() => setSelectedClient(client)}
              className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition cursor-pointer border-2 border-transparent hover:border-indigo-200"
            >
              {Object.entries(client.fields).map(([key, value]) => (
                <div key={key} className="mb-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {key}
                  </span>
                  <p className="text-gray-800 mt-1 break-words">
                    {Array.isArray(value) ? value.join(', ') : String(value)}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>

        {filteredClients.length === 0 && !loading && (
          <div className="text-center py-12 bg-white rounded-xl shadow-lg">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No clients found</p>
            <p className="text-gray-400 text-sm mt-2">
              Try adjusting your search or filters
            </p>
          </div>
        )}

        {/* Client Detail Modal */}
        {selectedClient && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedClient(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                  Client Details
                </h2>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="space-y-4">
                {Object.entries(selectedClient.fields).map(
                  ([key, value]) => (
                    <div
                      key={key}
                      className="border-b border-gray-200 pb-3"
                    >
                      <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        {key}
                      </span>
                      <p className="text-gray-800 mt-1 text-lg break-words">
                        {Array.isArray(value)
                          ? value.join(', ')
                          : String(value)}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        )}

        {/* Email Preview Modal */}
        {showEmailPreview && emailCampaign && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b p-6 rounded-t-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-800">
                    📧 Email Campaign Preview
                  </h2>
                  <button
                    onClick={() => setShowEmailPreview(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-700">
                    <strong>Recipients:</strong>{' '}
                    {emailCampaign.recipients.length} filtered clients
                  </p>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Email Content */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Subject Line
                  </label>
                  <input
                    type="text"
                    value={emailCampaign.subject}
                    onChange={(e) =>
                      setEmailCampaign({
                        ...emailCampaign,
                        subject: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Email Body
                    {emailCampaign.usePersonalization && (
                      <span className="ml-2 text-xs text-indigo-600">
                        (Use {'{{name}}'} for personalization)
                      </span>
                    )}
                  </label>
                  <textarea
                    value={emailCampaign.body}
                    onChange={(e) =>
                      setEmailCampaign({
                        ...emailCampaign,
                        body: e.target.value,
                      })
                    }
                    rows={12}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none font-mono text-sm"
                  />
                </div>

                {/* Preview for first recipient */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">
                    Preview (First Recipient)
                  </h3>
                  <div className="bg-gray-50 p-6 rounded-lg">
                    <div className="mb-4">
                      <p className="text-xs text-gray-500 mb-1">To:</p>
                      <p className="text-sm font-medium">
                        {emailCampaign.recipients[0].name} &lt;
                        {emailCampaign.recipients[0].email}&gt;
                      </p>
                    </div>
                    <div className="mb-4">
                      <p className="text-xs text-gray-500 mb-1">
                        Subject:
                      </p>
                      <p className="text-sm font-medium">
                        {emailCampaign.subject}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Body:</p>
                      <div className="bg-white p-4 rounded border text-sm whitespace-pre-wrap">
                        {emailCampaign.usePersonalization
                          ? emailCampaign.body.replace(
                              /\{\{name\}\}/g,
                              emailCampaign.recipients[0].name,
                            )
                          : emailCampaign.body}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recipient List */}
                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">
                    Recipients ({emailCampaign.recipients.length})
                  </h3>
                  <div className="max-h-60 overflow-y-auto bg-gray-50 rounded-lg p-4">
                    {emailCampaign.recipients.map((recipient, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0"
                      >
                        <div>
                          <p className="text-xs text-gray-600">
                            {recipient.email}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Send Button */}
                <div className="border-t pt-6 flex gap-4">
                  <button
                    onClick={() => setShowEmailPreview(false)}
                    className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendEmails}
                    className="flex-1 bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                  >
                    <Send className="w-5 h-5" />
                    Open in Email Client ({emailCampaign.recipients.length} Recipients)
                  </button>
                </div>

                {/* Warning Notice */}
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
                  <p className="text-sm text-blue-800">
                    <strong>📧 Email Client Integration:</strong> This will open your default email application with all recipients pre-filled.
                  </p>
                  <ul className="text-xs text-blue-700 mt-2 ml-4 list-disc space-y-1">
                    <li>All {emailCampaign.recipients.length} recipients will be added to the "To" field</li>
                    <li>Subject and body will be pre-filled</li>
                    <li>Review and customize before sending</li>
                    <li>For personalized emails, consider sending individually</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Button */}
      {!showChat && (
        <button
          onClick={() => setShowChat(true)}
          className="fixed bottom-6 right-6 bg-indigo-600 text-white p-4 rounded-full shadow-2xl hover:bg-indigo-700 transition-all hover:scale-110 z-50"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* Chat Window */}
      {showChat && (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col z-50">
          {/* Chat Header */}
          <div className="bg-indigo-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              <h3 className="font-semibold">AI Assistant</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowOpenAIConfig(!showOpenAIConfig)}
                className="text-white hover:text-indigo-200 text-xs"
              >
                {openaiKey ? '✓' : 'Configure'}
              </button>
              <button
                onClick={() => setShowChat(false)}
                className="text-white hover:text-indigo-200"
              >
                <Minimize2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* OpenAI Config Panel */}
          {showOpenAIConfig && (
            <div className="p-4 bg-indigo-50 border-b">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                OpenAI API Key
              </label>
              <input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Get your API key from OpenAI
              </p>
            </div>
          )}

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.length === 0 && (
              <div className="text-center text-gray-500 mt-8">
                <MessageCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-medium mb-2">
                  Ask me anything!
                </p>
                <div className="text-xs space-y-1">
                  <p>💬 "How many clients do we have?"</p>
                  <p>📧 "Generate a promotional email"</p>
                  <p>📊 "What fields are available?"</p>
                </div>
              </div>
            )}

            {chatMessages.map((msg, idx) => (
              <div key={idx}>
                <div
                  className={`flex ${
                    msg.role === 'user'
                      ? 'justify-end'
                      : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                </div>
                {msg.showPreviewButton && emailCampaign && (
                  <div className="flex justify-start mt-2">
                    <button
                      onClick={() => setShowEmailPreview(true)}
                      className="text-xs bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg hover:bg-indigo-200 transition flex items-center gap-1"
                    >
                      <Mail className="w-3 h-3" />
                      Preview Campaign
                    </button>
                  </div>
                )}
              </div>
            ))}

            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 p-3 rounded-lg">
                  <div className="flex gap-1">
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    ></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about clients or create emails..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm"
                disabled={chatLoading}
              />
              <button
                onClick={sendChatMessage}
                disabled={chatLoading || !chatInput.trim()}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {chatLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}