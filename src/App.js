import React, { useState, useEffect, useRef } from 'react';
import { Search, Filter, X, AlertCircle, Database, RefreshCw, MessageCircle, Send, Minimize2 } from 'lucide-react';

function ClientDatabase() {
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
    tableName: ''
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
  const chatEndRef = useRef(null);
  
  // Get OpenAI API key from environment variable
  const openaiKey = process.env.REACT_APP_OPENAI_API_KEY || '';

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
        `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tableName)}`,
        {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`
          }
        }
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

  // Send message to OpenAI
  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    if (!openaiKey) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Error: OpenAI API key is not configured. Please add REACT_APP_OPENAI_API_KEY to your .env file and restart the server.'
      }]);
      return;
    }

    const userMessage = chatInput.trim();
    setChatInput('');
    
    // Add user message
    const newMessages = [...chatMessages, { role: 'user', content: userMessage }];
    setChatMessages(newMessages);
    setChatLoading(true);

    try {
      // Prepare context about the Airtable data
      const dataContext = {
        totalClients: clients.length,
        availableFields: availableFilters,
        sampleData: clients.slice(0, 5).map(c => c.fields)
      };

      const systemMessage = {
        role: 'system',
        content: `You are a helpful assistant that answers questions about a client database. The database contains ${dataContext.totalClients} clients with the following fields: ${dataContext.availableFields.join(', ')}. Here's a sample of the data: ${JSON.stringify(dataContext.sampleData, null, 2)}. Provide clear, concise answers about the data. If asked to perform calculations or analysis, do so based on the information provided.`
      };

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [systemMessage, ...newMessages],
          max_tokens: 1000,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to get response from OpenAI');
      }

      const data = await response.json();
      const assistantMessage = data.choices[0].message.content;

      setChatMessages([...newMessages, { role: 'assistant', content: assistantMessage }]);
    } catch (err) {
      setChatMessages([...newMessages, { 
        role: 'assistant', 
        content: `Error: ${err.message}. Please check your OpenAI API key and try again.` 
      }]);
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
      results = results.filter(client => {
        return Object.values(client.fields).some(value => 
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    }

    Object.entries(filters).forEach(([field, value]) => {
      if (value) {
        results = results.filter(client => {
          const fieldValue = client.fields[field];
          return String(fieldValue).toLowerCase().includes(value.toLowerCase());
        });
      }
    });

    setFilteredClients(results);
  }, [searchTerm, filters, clients]);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const clearFilters = () => {
    setFilters({});
    setSearchTerm('');
  };

  // Render chat UI components
  const renderChatButton = () => (
    <button
      onClick={() => setShowChat(true)}
      className="fixed bottom-6 right-6 bg-indigo-600 text-white p-4 rounded-full shadow-2xl hover:bg-indigo-700 transition-all hover:scale-110 z-50"
      aria-label="Open chat"
    >
      <MessageCircle className="w-6 h-6" />
    </button>
  );

  const renderChatWindow = () => (
    <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-gray-200">
      {/* Chat Header */}
      <div className="bg-indigo-600 text-white p-4 rounded-t-2xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          <h3 className="font-semibold">AI Assistant</h3>
          {openaiKey && (
            <span className="text-xs bg-indigo-700 px-2 py-1 rounded">API Key Loaded</span>
          )}
        </div>
        <button
          onClick={() => setShowChat(false)}
          className="text-white hover:text-indigo-200"
          aria-label="Minimize chat"
        >
          <Minimize2 className="w-5 h-5" />
        </button>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {chatMessages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <MessageCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p className="text-sm font-medium">Ask me anything about your clients!</p>
            <p className="text-xs mt-2 text-gray-400">
              Examples: "How many clients do we have?" or "What fields are available?"
            </p>
          </div>
        )}
        
        {chatMessages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none'
                  : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        
        {chatLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 p-3 rounded-lg rounded-bl-none">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Chat Input */}
      <div className="p-4 border-t bg-white rounded-b-2xl">
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about your clients..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:border-indigo-500 focus:outline-none text-sm"
            disabled={chatLoading}
          />
          <button
            onClick={sendChatMessage}
            disabled={chatLoading || !chatInput.trim()}
            className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );

  if (showConfig) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <Database className="w-8 h-8 text-indigo-600" />
              <h1 className="text-3xl font-bold text-gray-800">Configure Airtable Connection</h1>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig({...config, apiKey: e.target.value})}
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
                  onChange={(e) => setConfig({...config, baseId: e.target.value})}
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
                  onChange={(e) => setConfig({...config, tableName: e.target.value})}
                  placeholder="tblXXXXXXXXXXXXXX"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:outline-none transition"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use the table ID (e.g., tblJvG4VJliD3bAZj) from your Airtable URL
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8 pb-24">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Database className="w-8 h-8 text-indigo-600" />
              <h1 className="text-3xl font-bold text-gray-800">Client Database</h1>
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
              {Object.values(filters).filter(v => v).length > 0 && (
                <span className="bg-indigo-600 text-white text-xs px-2 py-1 rounded-full">
                  {Object.values(filters).filter(v => v).length}
                </span>
              )}
            </button>
            
            {(searchTerm || Object.values(filters).some(v => v)) && (
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
              {availableFilters.map(field => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field}
                  </label>
                  <input
                    type="text"
                    value={filters[field] || ''}
                    onChange={(e) => handleFilterChange(field, e.target.value)}
                    placeholder={`Filter by ${field}...`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:border-indigo-500 focus:outline-none text-sm"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Results Count */}
        <div className="mb-4 text-gray-600">
          Showing {filteredClients.length} of {clients.length} clients
        </div>

        {/* Client Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.map(client => (
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
            <p className="text-gray-400 text-sm mt-2">Try adjusting your search or filters</p>
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
                <h2 className="text-2xl font-bold text-gray-800">Client Details</h2>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="space-y-4">
                {Object.entries(selectedClient.fields).map(([key, value]) => (
                  <div key={key} className="border-b border-gray-200 pb-3">
                    <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                      {key}
                    </span>
                    <p className="text-gray-800 mt-1 text-lg break-words">
                      {Array.isArray(value) ? value.join(', ') : String(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Chat Components - Always render */}
        {!showChat && renderChatButton()}
        {showChat && renderChatWindow()}
      </div>
    </div>
  );
}

export default ClientDatabase;