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
} from 'lucide-react';

function App() {
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

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const clientsPerPage = 10;

  // Chat states
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [openaiKey, setOpenaiKey] = useState('');
  const [showOpenAIConfig, setShowOpenAIConfig] = useState(false);
  const chatEndRef = useRef(null);

  // Email campaign state
  const [emailCampaign, setEmailCampaign] = useState(null);
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  // Load config from localStorage
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

  // Save Airtable config
  const saveConfig = () => {
    localStorage.setItem('airtableConfig', JSON.stringify(config));
    setShowConfig(false);
  };

  // Save OpenAI config
  const saveOpenAIConfig = () => {
    localStorage.setItem('openaiKey', openaiKey);
    setShowOpenAIConfig(false);
  };

  // Fetch ALL clients from Airtable (handle offset pagination)
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

        if (offset) {
          url += `&offset=${offset}`;
        }

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

      if (allRecords.length > 0) {
        const fields = Object.keys(allRecords[0].fields);
        setAvailableFilters(fields);
      }

      setShowConfig(false);
    } catch (err) {
      console.error(err);
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
            fields['FULL_NAME'] ||
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

    filteredClients.forEach((client) => {
      const fields = client.fields;
      const name =
        fields.Name ||
        fields.name ||
        fields['First Name'] ||
        fields['FULL_NAME'] ||
        '';
      if (name && lowerPrompt.includes(name.toLowerCase())) {
        clientNames.push(name);
      }
    });

    return clientNames;
  };

  // Generate email campaign via OpenAI
  const generateEmailCampaign = async (prompt) => {
    if (!openaiKey) {
      setError('Please configure your OpenAI API key first');
      setShowOpenAIConfig(true);
      return;
    }

    setChatLoading(true);
    setError('');

    try {
      const emails = extractEmails();
      extractClientNamesFromPrompt(prompt); // currently not used, but kept for future customization

      setChatMessages((prev) => [
        ...prev,
        { role: 'user', content: prompt },
      ]);

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

      const limitedClientInfo = emails.slice(0, 10).map((e, index) => ({
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
              content: `User instructions: ${prompt}\n\nExample recipients:\n${JSON.stringify(
                limitedClientInfo,
                null,
                2,
              )}`,
            },
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error('OpenAI error', data);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content returned from OpenAI');
      }

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
        recipients: emails,
      });

      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'I generated an email campaign. You can review it in the preview panel.',
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
            'I encountered an error while generating the email campaign.',
          error: true,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatSend = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput('');
    await generateEmailCampaign(msg);
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

  // Pagination helpers
  const totalPages = Math.max(
    1,
    Math.ceil(filteredClients.length / clientsPerPage),
  );
  const startIndex = (currentPage - 1) * clientsPerPage;
  const endIndex = startIndex + clientsPerPage;
  const paginatedClients = filteredClients.slice(startIndex, endIndex);

  const goToPage = (page) => {
    const safe = Math.min(Math.max(page, 1), totalPages);
    setCurrentPage(safe);
  };

  // CONFIG SCREEN
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
                <span className="text-sm text-red-700">{error}</span>
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

  // MAIN APP
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

        {/* Search Bar & Filters */}
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
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-3">
              {availableFilters.map((field) => (
                <div key={field}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    {field}
                  </label>
                  <input
                    type="text"
                    value={filters[field] || ''}
                    onChange={(e) =>
                      handleFilterChange(field, e.target.value)
                    }
                    placeholder={`Filter by ${field}`}
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Results Count */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-gray-600">
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

          {filteredClients.length > 0 && (
            <button
              onClick={() => {
                setShowChat(true);
                setChatMessages([]);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition text-sm"
            >
              <MessageCircle className="w-4 h-4" />
              Create Email Campaign
            </button>
          )}
        </div>

        {/* Client Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedClients.map((client) => (
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

        {/* Pagination controls */}
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

        {/* Client Detail Modal */}
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
                  {Object.entries(selectedClient.fields).map(([key, value]) => (
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
                  ))}
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

        {/* Email Preview Modal */}
        {showEmailPreview && emailCampaign && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-40">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
              {/* header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <MessageCircle className="w-4 h-4 text-indigo-600" />
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
                      {emailCampaign.recipients.length} clients
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
                        +
                        {emailCampaign.recipients.length - 20} more
                        recipients...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                <p className="text-xs text-gray-500">
                  You can export this content into your email tool. The content
                  is ready for a mass email campaign.
                </p>
                <button
                  onClick={() => setShowEmailPreview(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-white"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chat Panel */}
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
                <button
                  onClick={() => setShowChat(false)}
                  className="p-1 rounded-full hover:bg-indigo-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="h-72 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {chatMessages.length === 0 && (
                  <div className="text-xs text-gray-500 bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                    <p className="font-medium text-gray-700 mb-1">
                      How it works
                    </p>
                    <p>
                      Describe the email campaign you want to create (for
                      example: &ldquo;Write an intro email to all data science
                      professionals, inviting them to a free consultation.&rdquo;)
                    </p>
                  </div>
                )}

                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs shadow-sm ${
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleChatSend();
                      }
                    }}
                    className="flex-1 text-xs px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                    placeholder="Describe the email campaign you want to create..."
                  />
                  <button
                    onClick={handleChatSend}
                    disabled={chatLoading || !chatInput.trim()}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
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
          </div>
        )}
      </div>

      {/* Loading Overlay */}
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

export default App;
