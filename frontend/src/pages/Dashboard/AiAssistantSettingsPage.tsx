import React, { useEffect, useState } from 'react';
import { Bot, Sparkles, KeyRound, Save } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectItem,
  Card,
  Spinner,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  showToast,
} from '@ury/ui';
import { call } from '@ury/core';

interface AgentConfig {
  available: boolean;
  reason?: string;
  agent_name?: string;
  provider?: string;
  model?: string;
  temperature?: number;
  top_p?: number;
  enable_prompt_caching?: boolean;
  disabled?: boolean;
}

interface AiProvider {
  name: string;
  provider_brand: string;
  is_local_llm: boolean;
  has_key: boolean;
}

export const AiAssistantSettingsPage: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Enable/disable toggle
  const [aiEnabled, setAiEnabled] = useState<boolean>(false);
  const [togglingEnabled, setTogglingEnabled] = useState<boolean>(false);

  // Assistant configuration
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState<boolean>(false);

  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [temperature, setTemperature] = useState<number>(0.7);
  const [enableCaching, setEnableCaching] = useState<boolean>(false);

  // API key modal
  const [keyModalProvider, setKeyModalProvider] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [savingKey, setSavingKey] = useState<boolean>(false);

  const fetchProviders = async () => {
    try {
      const res = await call.get<any>('ury.ury.api.ury_ai_settings.list_ai_providers');
      const data = res.message ?? res;
      setProviders(data?.providers || []);
    } catch (err) {
      console.error('Failed to fetch AI providers:', err);
    }
  };

  const fetchModels = async (provider: string) => {
    if (!provider) {
      setModels([]);
      return;
    }
    setLoadingModels(true);
    try {
      const res = await call.get<any>('ury.ury.api.ury_ai_settings.list_ai_models', { provider });
      const data = res.message ?? res;
      setModels(data?.models || []);
    } catch (err) {
      console.error('Failed to fetch AI models:', err);
      setModels([]);
    } finally {
      setLoadingModels(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [settingsRes, configRes] = await Promise.all([
        call.get<any>('ury.ury.api.ury_ai_settings.get_ai_settings'),
        call.get<any>('ury.ury.api.ury_ai_settings.get_agent_config'),
      ]);
      const settings = settingsRes.message ?? settingsRes;
      const config: AgentConfig = configRes.message ?? configRes;

      setAiEnabled(!!settings?.enabled);
      setAgentConfig(config);

      if (config?.available) {
        setSelectedProvider(config.provider || '');
        setSelectedModel(config.model || '');
        setTemperature(config.temperature ?? 0.7);
        setEnableCaching(!!config.enable_prompt_caching);
        await fetchProviders();
        if (config.provider) {
          await fetchModels(config.provider);
        }
      }
    } catch (err) {
      console.error('Failed to load AI assistant settings:', err);
      showToast.error('Failed to load AI assistant settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleToggleEnabled = async (checked: boolean) => {
    setTogglingEnabled(true);
    const previous = aiEnabled;
    setAiEnabled(checked);
    try {
      const res = await call.post<any>('ury.ury.api.ury_ai_settings.set_ai_enabled', { enabled: checked });
      const data = res.message ?? res;
      setAiEnabled(!!data?.enabled);
    } catch (err: any) {
      setAiEnabled(previous);
      showToast.error(err?.message || 'Failed to update assistant enabled state');
    } finally {
      setTogglingEnabled(false);
    }
  };

  const handleProviderChange = async (val: string) => {
    setSelectedProvider(val);
    setSelectedModel('');
    await fetchModels(val);
  };

  const handleSaveConfig = async () => {
    if (!agentConfig?.available) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      if (selectedProvider !== (agentConfig.provider || '')) payload.provider = selectedProvider;
      if (selectedModel !== (agentConfig.model || '')) payload.model = selectedModel;
      if (temperature !== agentConfig.temperature) payload.temperature = temperature;
      if (enableCaching !== !!agentConfig.enable_prompt_caching) payload.enable_prompt_caching = enableCaching;

      const res = await call.post<any>('ury.ury.api.ury_ai_settings.update_agent_config', payload);
      const data: AgentConfig = res.message ?? res;
      setAgentConfig(data);
      setSelectedProvider(data.provider || '');
      setSelectedModel(data.model || '');
      setTemperature(data.temperature ?? 0.7);
      setEnableCaching(!!data.enable_prompt_caching);
      showToast.success('Assistant configuration saved');
    } catch (err: any) {
      showToast.error(err?.message || 'Failed to save assistant configuration');
    } finally {
      setSaving(false);
    }
  };

  const openKeyModal = (provider: string) => {
    setKeyModalProvider(provider);
    setApiKeyInput('');
  };

  const closeKeyModal = () => {
    setKeyModalProvider(null);
    setApiKeyInput('');
  };

  const handleSaveKey = async () => {
    if (!keyModalProvider || !apiKeyInput.trim()) return;
    setSavingKey(true);
    try {
      await call.post('ury.ury.api.ury_ai_settings.set_provider_api_key', {
        provider: keyModalProvider,
        api_key: apiKeyInput,
      });
      closeKeyModal();
      showToast.success('API key saved');
      await fetchProviders();
    } catch (err: any) {
      showToast.error(err?.message || 'Failed to save API key');
    } finally {
      setSavingKey(false);
      setApiKeyInput('');
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center bg-card rounded-lg border border-border">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-6 rounded-xl border border-border shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-semibold shrink-0">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">AI Assistant Settings</h1>
              <p className="text-sm text-muted-foreground">
                Control the floating chat assistant and ask bar available across the app.
              </p>
            </div>
          </div>
        </div>

        {/* Enable toggle */}
        <Card className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
          <div className="p-6">
            <div className="flex items-center justify-between p-4 bg-card rounded-xl border border-border">
              <div>
                <span className="text-sm font-semibold text-foreground block">Enable AI Assistant</span>
                <span className="text-xs text-muted-foreground">
                  Controls the floating chat button and the ⌘K ask bar across the app. Turning this off hides
                  them for everyone.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  disabled={togglingEnabled}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleToggleEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>
        </Card>

        {/* Assistant configuration */}
        <Card className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-bold text-foreground">Assistant Configuration</h2>
            <p className="text-xs text-muted-foreground">Provider, model, and response behavior for the assistant.</p>
          </div>

          {!agentConfig?.available ? (
            <div className="flex flex-col items-center justify-center gap-2 text-center py-12 px-6">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">The assistant isn't available to configure right now.</p>
              {agentConfig?.reason && (
                <p className="text-xs text-muted-foreground/70">{agentConfig.reason}</p>
              )}
            </div>
          ) : (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Provider</label>
                  <Select value={selectedProvider} onValueChange={handleProviderChange}>
                    {providers.map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.provider_brand}
                      </SelectItem>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Model</label>
                  <Select
                    value={selectedModel}
                    onValueChange={(val: string) => setSelectedModel(val)}
                    disabled={loadingModels || !selectedProvider}
                  >
                    {models.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Temperature ({temperature.toFixed(1)})
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={temperature}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTemperature(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <span className="text-xs text-muted-foreground mt-1 block">
                    Lower is more focused and deterministic; higher is more creative.
                  </span>
                </div>

                <div className="flex items-center justify-between p-4 bg-card rounded-xl border border-border">
                  <div>
                    <span className="text-sm font-semibold text-foreground block">Cache Responses</span>
                    <span className="text-xs text-muted-foreground">Enable prompt caching to reduce cost and latency.</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableCaching}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnableCaching(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-white flex items-center gap-2"
                >
                  {saving ? <Spinner className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  Save Configuration
                </Button>
              </div>

              {/* Providers & API keys */}
              <div className="pt-4 border-t border-border space-y-3">
                <h3 className="text-sm font-bold text-foreground">Providers</h3>
                <div className="border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm text-muted-foreground">
                    <thead className="bg-card text-foreground font-medium border-b border-border">
                      <tr>
                        <th className="p-3.5">Provider</th>
                        <th className="p-3.5">Key Status</th>
                        <th className="p-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {providers.map((p) => (
                        <tr key={p.name} className="hover:bg-card/50">
                          <td className="p-3.5 text-foreground font-medium">{p.provider_brand}</td>
                          <td className="p-3.5">
                            {p.has_key ? (
                              <Badge variant="success" size="sm">key set</Badge>
                            ) : (
                              <Badge variant="secondary" size="sm">no key</Badge>
                            )}
                          </td>
                          <td className="p-3.5 text-right">
                            <Button size="sm" variant="outline" onClick={() => openKeyModal(p.name)} className="inline-flex items-center gap-1.5">
                              <KeyRound className="w-3.5 h-3.5" />
                              Set API Key
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Set API Key modal */}
      <Dialog open={!!keyModalProvider} onOpenChange={(open: boolean) => !open && closeKeyModal()}>
        <DialogContent className="max-w-md bg-card p-6 rounded-xl border border-border shadow-xl" onClose={closeKeyModal}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">Set API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              API Key for {keyModalProvider}
            </label>
            <Input
              type="password"
              value={apiKeyInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKeyInput(e.target.value)}
              placeholder="Paste API key"
              autoComplete="off"
            />
          </div>
          <DialogFooter className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeKeyModal}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveKey}
              disabled={savingKey || !apiKeyInput.trim()}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              {savingKey ? <Spinner className="w-4 h-4" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AiAssistantSettingsPage;
