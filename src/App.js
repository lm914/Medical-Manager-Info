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
  Trash2,
} from 'lucide-react';

// Keep requests small for OpenAI
const MAX_CLIENTS_FOR_AI = 80;      // first 80 filtered clients
const MAX_RECIPIENTS_FOR_AI = 80;   // first 80 selected recipients shown to AI

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

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const clientsPerPage = 10;

  // Selected clients (checkboxes)
  const [selectedClientIds, setSelectedClientIds] = useState([]);

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

  // Scroll chat to bottom
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  // Load stored configs
  useEffect(() => {
    const savedConfig = localStorage.getItem('airtableConfig');
    if (savedConfig) {
      setConfig(JSON.parse(savedConfig));
      setShowConfig(false);
    }

    const savedOpenAIKey = localStorage.getItem('openaiKey');
    if (savedOpenAIKey) {
      setOpenaiKey(savedOpenAIKey);
    }
  }, []);

  const saveConfig = () => {
    localStorage.setItem('airtableConfig', JSON.stringify(config));
    setShowConfig(false);
  };

  const saveOpenAIConfig = () => {
    localStorage.setItem('openaiKey', openaiKey);
    setShowOpenAIConfig(false);
  };

  // Fetch ALL Airtable records (handle offset)
  const fetchClients = async () => {
    if (!config.apiKey || !config.baseId || !config.tableName) {
      setError('Please configure all Airtable settings');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const headers = {
        Authorization: `Bearer ${config.apiKey}`,
      };

      let allRecords = [];
      let offset;

      do {
        let url = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(
          config.tableName,
        )}?pageSize=100`;

        if (offset) url += `&offset=${offset}`;

        const response = await fetch(url, { headers });
        if (!response.ok) {
          throw new Error(`Error: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        allRecords = allRecords.concat(data.records || []);
        offset = data.offset;
      } while (offset);

      setClients(allRecords);
      setFilteredClients(allRecords);
      setCurrentPage(1);
      setSelectedClientIds([]);

      if (allRecords.length > 0) {
        const fields = Object.keys(allRecords[0].fields || {});
        setAvailableFilters(fields);
      }

      setShowConfig(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Checkbox selection
  const toggleClientSelection = (id) => {
    setSelectedClientIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSelectAllFiltered = () => {
    setSelectedClientIds(filteredClients.map((c) => c.id));
  };

  const handleDeselectAll = () => {
    setSelectedClientIds([]);
  };

  // Helper: pull email/name from a list of records
  const extractEmailsFromList = (list) => {
    const emails = [];
    list.forEach((client) => {
      const fields = client.fields || {};
      const emailField = Object.keys(fields).find((key) => {
        const lower = key.toLowerCase();
        return lower.includes('email') || lower === 'e-mail';
      });

      if (emailField && fields[emailField]) {
        emails.push({
          email: fields[emailField],
          name:
            fields.FULL_NAME ||
            fields.full_name ||
            fields['Full Name'] ||
            fields.Name ||
            fields.name ||
            fields.FIRST_NAME ||
            fields['First Name'] ||
            fields['first_name'] ||
            'Client',
          clientData: fields,
        });
      }
    });
    return emails;
  };

  // Find names mentioned in user prompt (using filtered clients for now)
  const extractClientNamesFromPrompt = (prompt) => {
    const lowerPrompt = prompt.toLowerCase();
    const names = new Set();

    filteredClients.forEach((client) => {
      const f = client.fields || {};
      const possibleNames = [
        f.FULL_NAME,
        f.full_name,
        f['Full Name'],
        f.Name,
        f.name,
        f.FIRST_NAME,
        f['First Name'],
      ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());

      possibleNames.forEach((nm) => {
        if (nm && lowerPrompt.includes(nm)) {
          names.add(nm);
        }
      });
    });

    return Array.from(names);
  };

  // MAIN recipient builder
  // 1) use selected checkboxes; if none selected but names mentioned, fallback to name-matching
  const extractEmails = (promptText = '') => {
    let baseList = clients.filter((c) => selectedClientIds.includes(c.id));

    if (baseList.length === 0 && promptText) {
      // fallback: infer recipients from names in prompt
      const namesFromPrompt = extractClientNamesFromPrompt(promptText);
      if (namesFromPrompt.length) {
        const lowerNames = namesFromPrompt.map((n) => n.toLowerCase());
        baseList = clients.filter((c) => {
          const f = c.fields || {};
          const nameValues = [
            f.FULL_NAME,
            f.full_name,
            f['Full Name'],
            f.Name,
            f.name,
            f.FIRST_NAME,
            f['First Name'],
          ]
            .filter(Boolean)
            .map((v) => String(v).toLowerCase());
          return nameValues.some((nv) =>
            lowerNames.some((ln) => nv.includes(ln)),
          );
        });
      }
    }

    return extractEmailsFromList(baseList);
  };

  // Build DB context for the AI (cap + slim fields)
  const buildDbContext = () => {
    const selected = filteredClients.filter((c) =>
      selectedClientIds.includes(c.id),
    );

    const IMPORTANT_FIELDS = [
      // names
      'FULL_NAME',
      'full_name',
      'Full Name',
      'Name',
      'name',
      'FIRST_NAME',
      'First Name',
      'LAST_NAME',
      'Last Name',
      // emails
      'EMAIL',
      'Email',
      'E-mail',
      'EMAIL1',
      'EMAIL2',
      'EMAIL3',
      // location
      'PERSON_CITY',
      'PERSON_STATE',
      'PERSON_COUNTRY',
      'City',
      'State',
      'Country',
      // company
      'COMPANY',
      'Company',
    ];

    const slimClient = (c) => {
      const out = { id: c.id, fields: {} };
      const f = c.fields || {};
      IMPORTANT_FIELDS.forEach((key) => {
        if (f[key] !== undefined) out.fields[key] = f[key];
      });
      return out;
    };

    const slimFiltered = filteredClients
      .slice(0, MAX_CLIENTS_FOR_AI)
      .map(slimClient);
    const slimSelected = selected.slice(0, MAX_CLIENTS_FOR_AI).map(slimClient);

    return {
      totalClients: clients.length,
      filteredCount: filteredClients.length,
      selectedCount: selectedClientIds.length,
      selectedClientIds,
      maxClientsForAI: MAX_CLIENTS_FOR_AI,
      clients: slimFiltered,
      selectedClients: slimSelected,
    };
  };

  // Chat only
  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    if (!openaiKey) {
      setError('Please configure your OpenAI API key first');
      setShowOpenAIConfig(true);
      return;
    }

    const message = chatInput.trim();
    setChatInput('');

    const userMessage = { role: 'user', content: message };
    setChatMessages((prev) => [...prev, userMessage]);

    setChatLoading(true);
    setError('');

    try {
      const historyMessages = chatMessages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));

      const dbContext = buildDbContext();

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful assistant for client outreach and marketing. You will be given a JSON "client_db_context" that contains summary information and up to 80 filtered clients, each with only key fields (names, emails, company, location). Use it to answer questions. If the user asks about clients beyond what you see, say that you only have access to the first 80 filtered clients.',
            },
            {
              role: 'user',
              content:
                'Here is the current client database context (up to 80 filtered clients):\n' +
                JSON.stringify(dbContext, null, 2),
            },
            ...historyMessages,
            userMessage,
          ],
          temperature: 0.7,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error('OpenAI chat error', data);
        throw new Error(
          data.error?.message ||
            `OpenAI API error: ${response.status} ${response.statusText}`,
        );
      }

      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error('No content returned from OpenAI');

      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content },
      ]);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to get response from OpenAI.');
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'I encountered an error while responding. Please try again or check your API key.\n\nDetails: ' +
            (err.message || ''),
          error: true,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  // Generate email campaign using current chatInput as prompt
  const generateEmailCampaign = async (prompt) => {
    if (!openaiKey) {
      setError('Please configure your OpenAI API key first');
      setShowOpenAIConfig(true);
      return;
    }

    const emails = extractEmails(prompt);
    if (!emails.length) {
      setError(
        'No recipients found. Please select at least one client (with an email) or mention a client name clearly in your prompt.',
      );
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'Please select at least one client using the checkboxes, or clearly mention which client(s) you want (for example, “send an email to Tina Cheng”) before asking me to draft a campaign.',
          error: true,
        },
      ]);
      return;
    }

    setChatLoading(true);
    setError('');

    try {
      const clientNames = extractClientNamesFromPrompt(prompt);

      const systemPrompt = `You are an AI assistant specialized in writing professional and personalized email campaigns.
You will receive high-level instructions from the user about an email campaign to send to a list of clients.

Output MUST be valid JSON with exactly this structure:
{
  "subject": "string",
  "previewText": "string",
  "bodyHtml": "string",
  "bodyText": "string"
}

- subject: catchy subject line
- previewText: short preview line
- bodyHtml: HTML email body (<p>, <strong>, <ul>, etc.)
- bodyText: same content as plain text
Do NOT include backticks, markdown fences, or anything other than the JSON.`;

      const fullRecipientInfo = emails
        .slice(0, MAX_RECIPIENTS_FOR_AI)
        .map((e, index) => ({
          index: index + 1,
          name: e.name,
          email: e.email,
        }));

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `User instructions: ${prompt}\n\nSample of recipients (up to ${MAX_RECIPIENTS_FOR_AI}):\n${JSON.stringify(
                fullRecipientInfo,
                null,
                2,
              )}\n\nMentioned client names: ${JSON.stringify(clientNames)}`,
            },
          ],
          temperature: 0.7,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error('OpenAI campaign error', data);
        throw new Error(
          data.error?.message ||
            `OpenAI API error: ${response.status} ${response.statusText}`,
        );
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('No content returned from OpenAI');

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('Failed to parse JSON from OpenAI');
        parsed = JSON.parse(match[0]);
      }

      setEmailCampaign({
        ...parsed,
        recipients: emails, // ALL recipients (not just the sample)
      });

      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'I generated an email campaign for the chosen recipients. You can review it in the preview panel.',
        },
      ]);
      setShowEmailPreview(true);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to generate email campaign.');
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'I encountered an error while generating the email campaign.\n\nDetails: ' +
            (err.message || ''),
          error: true,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleGenerateCampaignClick = async () => {
    if (!chatInput.trim()) return;
    const prompt = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: prompt }]);
    await generateEmailCampaign(prompt);
  };

  // Open default email app with generated campaign
  const sendEmails = () => {
    if (!emailCampaign || !emailCampaign.recipients?.length) {
      alert('No email campaign or recipients found.');
      return;
    }

    try {
      const toList = emailCampaign.recipients
        .map((r) => r.email)
        .filter(Boolean)
        .join(',');

      if (!toList) {
        alert('No valid email addresses found.');
        return;
      }

      const emailBody = emailCampaign.bodyText || emailCampaign.bodyHtml || '';
      const subject = encodeURIComponent(emailCampaign.subject);
      const body = encodeURIComponent(emailBody);

      const mailtoLink = `mailto:${toList}?subject=${subject}&body=${body}`;
      window.location.href = mailtoLink;

      alert(
        `Opening email client with ${emailCampaign.recipients.length} recipients...`,
      );
    } catch (err) {
      alert(`Error opening email client: ${err.message}`);
    }
  };

  // Apply search & filters
  useEffect(() => {
    let results = [...clients];

    if (searchTerm) {
      results = results.filter((client) =>
        Object.values(client.fields || {}).some((value) =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase()),
        ),
      );
    }

    Object.entries(filters).forEach(([field, value]) => {
      if (value) {
        results = results.filter((client) => {
          const fieldValue = (client.fields || {})[field];
          return String(fieldValue || '')
            .toLowerCase()
            .includes(value.toLowerCase());
        });
      }
    });

    setFilteredClients(results);
    setCurrentPage(1);
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
    setCurrentPage(1);
  };

  // Pagination
  const totalPages = Math.max(
    1,
    Math.ceil(filteredClients.length / clientsPerPage),
  );
  const startIndex = (currentPage - 1) * clientsPerPage;
  const endIndex = startIndex + clientsPerPage;
  const paginatedClients = filteredClients.slice(startIndex, endIndex);

  const goToPage = (page) => {
    const safePage = Math.min(Math.max(page, 1), totalPages);
    setCurrentPage(safePage);
  };

  // --- CONFIG SCREEN ---
  if (showConfig) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-indigo-100 rounded-xl">
                <Database className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Connect to Airtable
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Enter your Airtable API details to load your client database.
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex gap-2 items-center">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-700 whitespace-pre-wrap">
                  {error}
                </span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Airtable API Key
                </label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, apiKey: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="patXXXXXXXXXXXX"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Base ID
                  </label>
                  <input
                    type="text"
                    value={config.baseId}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, baseId: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="appXXXXXXXXXXXX"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Table Name
                  </label>
                  <input
                    type="text"
                    value={config.tableName}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        tableName: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Clients"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-between items-center">
              <button
                onClick={saveConfig}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
              >
                Save Settings
              </button>
              <button
                onClick={fetchClients}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    Connect &amp; Load Clients
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN APP ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-100 rounded-xl">
              <Database className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Client Database
              </h1>
              <p className="text-sm text-gray-500">
                Connected to your Airtable base. Search, filter, and manage your
                clients.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <button
              onClick={() => setShowConfig(true)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm hover:bg-white bg-white/70"
            >
              Change Connection
            </button>

            <button
              onClick={() => setShowOpenAIConfig(true)}
              className="px-4 py-2 rounded-lg border border-indigo-200 text-indigo-700 text-sm bg-indigo-50 hover:bg-indigo-100 flex items-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              OpenAI Settings
            </button>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="bg-white rounded-2xl shadow-lg p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search clients..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none transition"
              />
            </div>

            <button
              onClick={() => setShowFilters((prev) => !prev)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>

            {(searchTerm || Object.keys(filters).length > 0) && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>

          {showFilters && availableFilters.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                    className="w-full px-3 py-2 border border-gray-200 rounded-md focus:border-indigo-500 focus:outline-none text-sm"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Counts & selection tools */}
        <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-col gap-1 text-gray-600 text-sm">
            <span>
              {filteredClients.length > 0 ? (
                <>
                  Showing {startIndex + 1}–
                  {Math.min(endIndex, filteredClients.length)} of{' '}
                  {filteredClients.length} filtered clients
                  {clients.length !== filteredClients.length &&
                    ` (total in base: ${clients.length})`}
                </>
              ) : (
                <>Showing 0 of {clients.length} clients</>
              )}
            </span>
            <span className="text-xs text-indigo-700">
              Selected clients: {selectedClientIds.length}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={handleSelectAllFiltered}
              disabled={filteredClients.length === 0}
              className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Select All Filtered
            </button>

            <button
              onClick={handleDeselectAll}
              disabled={selectedClientIds.length === 0}
              className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Deselect All
            </button>

            {filteredClients.length > 0 && (
              <button
                onClick={() => setShowChat(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition text-sm font-medium"
              >
                <Mail className="w-4 h-4" />
                Open Campaign Chat
              </button>
            )}
          </div>
        </div>

        {/* Client cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedClients.map((client) => {
            const isSelected = selectedClientIds.includes(client.id);
            return (
              <div
                key={client.id}
                onClick={() => setSelectedClient(client)}
                className={`bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition cursor-pointer border-2 ${
                  isSelected ? 'border-indigo-400' : 'border-transparent'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Select
                  </span>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleClientSelection(client.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 cursor-pointer"
                  />
                </div>

                {Object.entries(client.fields || {}).map(([key, value]) => (
                  <div key={key} className="mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {key}
                    </span>
                    <p className="text-gray-800 mt-1 break-words text-sm">
                      {Array.isArray(value) ? value.join(', ') : String(value)}
                    </p>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {filteredClients.length > 0 && (
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        )}

        {/* No results */}
        {filteredClients.length === 0 && !loading && (
          <div className="text-center py-12 bg-white rounded-xl shadow-lg mt-6">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No clients found</p>
            <p className="text-gray-400 text-sm mt-2">
              Try adjusting your search or filters.
            </p>
          </div>
        )}

        {/* Client detail modal */}
        {selectedClient && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-40">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <Database className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">
                      Client Details
                    </h2>
                    <p className="text-xs text-gray-500">
                      ID: {selectedClient.id}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="p-1 rounded-full hover:bg-gray-100"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(selectedClient.fields || {}).map(
                    ([key, value]) => (
                      <div
                        key={key}
                        className="bg-gray-50 rounded-lg p-3 border border-gray-100"
                      >
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                          {key}
                        </div>
                        <div className="text-sm text-gray-800 break-words">
                          {Array.isArray(value)
                            ? value.join(', ')
                            : String(value)}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>

              <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => setSelectedClient(null)}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-white"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Email preview modal */}
        {showEmailPreview && emailCampaign && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-40">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <Mail className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">
                      Email Campaign Preview
                    </h2>
                    <p className="text-xs text-gray-500">
                      Subject: {emailCampaign.subject}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowEmailPreview(false)}
                  className="p-1 rounded-full hover:bg-gray-100"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <div className="flex flex-col md:flex-row h-[70vh]">
                <div className="w-full md:w-2/3 p-6 overflow-y-auto border-b md:border-b-0 md:border-r border-gray-100">
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                      Subject
                    </div>
                    <div className="text-sm text-gray-900">
                      {emailCampaign.subject}
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                      Preview Text
                    </div>
                    <div className="text-sm text-gray-900">
                      {emailCampaign.previewText}
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                      HTML Body
                    </div>
                    <div className="text-sm text-gray-800 border border-gray-100 rounded-lg p-3 bg-gray-50">
                      <div
                        dangerouslySetInnerHTML={{
                          __html: emailCampaign.bodyHtml,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                      Plain Text Body
                    </div>
                    <pre className="text-xs text-gray-800 border border-gray-100 rounded-lg p-3 bg-gray-50 whitespace-pre-wrap">
                      {emailCampaign.bodyText}
                    </pre>
                  </div>
                </div>

                <div className="w-full md:w-1/3 p-6 bg-gray-50 overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Recipients
                    </h3>
                    <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
                      {emailCampaign.recipients.length} recipients
                    </span>
                  </div>

                  <div className="space-y-3">
                    {emailCampaign.recipients
                      .slice(0, 20)
                      .map((recipient, index) => (
                        <div
                          key={index}
                          className="bg-white rounded-lg p-3 shadow-sm border border-gray-100"
                        >
                          <div className="text-sm font-medium text-gray-900">
                            {recipient.name || 'Unnamed Client'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {recipient.email}
                          </div>
                        </div>
                      ))}
                    {emailCampaign.recipients.length > 20 && (
                      <div className="text-xs text-gray-500 text-center pt-2">
                        +{emailCampaign.recipients.length - 20} more
                        recipients...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                <p className="text-xs text-gray-500">
                  This campaign will be sent only to clients inferred from your
                  selection/prompt.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={sendEmails}
                    className="px-4 py-2 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2"
                  >
                    <Mail className="w-4 h-4" />
                    Send via Email App
                  </button>
                  <button
                    onClick={() => setShowEmailPreview(false)}
                    className="px-4 py-2 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Floating chat button */}
        {!showChat && filteredClients.length > 0 && (
          <button
            onClick={() => setShowChat(true)}
            className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-indigo-600 text-white shadow-xl flex items-center justify-center hover:bg-indigo-700 z-40"
          >
            <MessageCircle className="w-6 h-6" />
          </button>
        )}

        {/* Chat panel */}
        {showChat && (
          <div className="fixed bottom-4 right-4 w-full max-w-md z-50">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
              <div className="flex items-center justify-between px-4 py-2 bg-indigo-600 text-white">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Email Campaign Assistant
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setChatMessages([])}
                    className="p-1 rounded-full hover:bg-indigo-500"
                    title="Clear chat"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowChat(false)}
                    className="p-1 rounded-full hover:bg-indigo-500"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="h-72 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {chatMessages.length === 0 && (
                  <div className="text-xs text-gray-500 bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                    <p className="font-medium text-gray-700 mb-1">
                      How it works
                    </p>
                    <p className="mb-2">
                      1) Select clients with checkboxes (optional). <br />
                      2) Or just mention them by name, like “send an email to
                      Tina”.
                    </p>
                    <p className="mb-2">
                      <strong>Database access:</strong> for each message, the AI
                      sees a summary plus{' '}
                      <strong>up to {MAX_CLIENTS_FOR_AI} clients</strong> from
                      your current filtered list, with names, emails, company,
                      and location. If there are more, it only sees the first{' '}
                      {MAX_CLIENTS_FOR_AI}.
                    </p>
                    <p>
                      3) Type a normal question and click the purple button to
                      chat. <br />
                      4) Type campaign instructions and use the green button to{' '}
                      <strong>Generate Campaign</strong>.
                    </p>
                  </div>
                )}

                {chatMessages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs shadow-sm whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-indigo-600 text-white rounded-br-none'
                          : msg.error
                          ? 'bg-red-50 text-red-700 rounded-bl-none'
                          : 'bg-white text-gray-800 rounded-bl-none'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white text-gray-500 rounded-2xl rounded-bl-none px-3 py-2 text-xs shadow-sm flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse" />
                      <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse delay-75" />
                      <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse delay-150" />
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              <div className="border-t border-gray-100 p-3 bg-white">
                <div className="flex items-end gap-2">
                  <textarea
                    rows={1}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyPress}
                    className="flex-1 text-xs px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                    placeholder="Ask a question or describe the campaign you want..."
                  />
                  <button
                    onClick={sendChatMessage}
                    disabled={chatLoading || !chatInput.trim()}
                    className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                    title="Ask AI"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleGenerateCampaignClick}
                    disabled={chatLoading || !chatInput.trim()}
                    className="p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                    title="Generate email campaign for inferred recipients"
                  >
                    <Mail className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* OpenAI settings modal */}
        {showOpenAIConfig && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-40">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <MessageCircle className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">
                      OpenAI API Settings
                    </h2>
                    <p className="text-xs text-gray-500">
                      Configure your OpenAI API key to use the AI assistant.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowOpenAIConfig(false)}
                  className="p-1 rounded-full hover:bg-gray-100"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <div className="p-6">
                {error && (
                  <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex gap-2 items-center">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-xs text-red-700 whitespace-pre-wrap">
                      {error}
                    </span>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      OpenAI API Key
                    </label>
                    <input
                      type="password"
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="sk-..."
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Your API key is stored locally in your browser and never
                      shared with others.
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                <button
                  onClick={() => setShowOpenAIConfig(false)}
                  className="px-4 py-2 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  onClick={saveOpenAIConfig}
                  className="px-4 py-2 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Save API Key
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-40">
          <div className="bg-white rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
            <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin" />
            <span className="text-sm text-gray-700">
              Loading clients from Airtable...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
