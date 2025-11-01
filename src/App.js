import React, { useState, useEffect } from 'react';
import { Search, Filter, X, AlertCircle, Database, RefreshCw } from 'lucide-react';

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
    tableName: ''
  });
  
  // Filter states
  const [filters, setFilters] = useState({});
  const [availableFilters, setAvailableFilters] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

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
      
      // Extract available filter fields
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

  // Apply search and filters
  useEffect(() => {
    let results = [...clients];

    // Apply search
    if (searchTerm) {
      results = results.filter(client => {
        return Object.values(client.fields).some(value => 
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
    }

    // Apply filters
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
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
      </div>
    </div>
  );
}