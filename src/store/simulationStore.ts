import { create } from 'zustand';
import toast from 'react-hot-toast';
import { apiClient, getWebSocketUrl } from '../api/client';
import type {
  AgentAction,
  AgentsInfo,
  AptMatch,
  BattleBriefing,
  BattleScoreboard,
  ContestEvent,
  DecisionScores,
  GiskardReport,
  GiskardStatus,
  IntegrationEventMessage,
  IntegrationFeedEvent,
  InitMessage,
  KillChainState,
  NetworkGraphState,
  NodeBattleResult,
  PipelineState,
  Playbook,
  StepHistorySummary,
  StepMessage,
  ThreatAlert,
  TrainingMetrics,
} from '../lib/ops-types';

type StreamMessage = InitMessage | StepMessage | IntegrationEventMessage;
type ThreatType = ThreatAlert['threat_type'];
const ENTERPRISE_API_KEY_STORAGE = 'athernex_api_key';

const getEnterpriseApiKey = () =>
  typeof window === 'undefined'
    ? 'ath_local_admin'
    : window.localStorage.getItem(ENTERPRISE_API_KEY_STORAGE) || 'ath_local_admin';

export interface TelemetryLog {
  id: string;
  team: 'red' | 'blue' | 'system';
  type: string;
  message: string;
  step: number;
  tone: 'critical' | 'warning' | 'info' | 'success';
}

interface SimulationState {
  simulationId: string | null;
  isConnected: boolean;
  network: NetworkGraphState | null;
  logs: TelemetryLog[];
  alerts: ThreatAlert[];
  step: number;
  maxSteps: number;
  phase: string;
  apiBaseUrl: string;
  briefing: BattleBriefing | null;
  scoreboard: BattleScoreboard | null;
  contestEvents: ContestEvent[];
  battleResults: NodeBattleResult[];
  redQValues: Record<string, DecisionScores>;
  bluePolicyProbs: Record<string, DecisionScores>;
  pipeline: PipelineState | null;
  latestRedAction: AgentAction | null;
  latestBlueAction: AgentAction | null;
  redCumulative: number;
  blueCumulative: number;
  episodeHistorySummary: StepHistorySummary[];
  trainingMetrics: TrainingMetrics | null;
  agentsInfo: AgentsInfo | null;
  playbooks: Playbook[];
  giskardStatus: GiskardStatus | null;
  giskardReports: GiskardReport[];
  killChain: KillChainState | null;
  aptAttribution: AptMatch[];
  integrationEvents: IntegrationFeedEvent[];
  stepHistory: StepMessage[];
  autoStep: boolean;
  autoStepInterval: number | null;
  _socket: WebSocket | null;
  _connectionAttempted: boolean;
  setApiBaseUrl: (url: string) => void;
  startSimulation: () => Promise<void>;
  generateStep: () => void;
  resetSimulation: () => void;
  toggleAutoStep: () => void;
  replayStep: (stepIndex: number) => void;
  triggerAttack: (targetNode: number, threatType: ThreatType) => Promise<void>;
  loadTrainingMetrics: () => Promise<void>;
  loadAgentsInfo: () => Promise<void>;
  loadPlaybooks: () => Promise<void>;
  generatePlaybook: (alertId?: string) => Promise<Playbook | null>;
  loadGiskardStatus: () => Promise<void>;
  loadGiskardReports: () => Promise<void>;
  runGiskardScan: (mode: 'blue' | 'red') => Promise<void>;
  uploadSIEMFeed: (file: File) => Promise<void>;
  ingestUrlFeed: (url: string, vendor?: string) => Promise<void>;
  viewMode: '2d' | '3d';
  selectedNodeId: number | null;
  setViewMode: (mode: '2d' | '3d') => void;
  setSelectedNodeId: (id: number | null) => void;
}

const mergeById = <T extends { id: string }>(existing: T[], incoming: T[]) => {
  const seen = new Set(incoming.map((item) => item.id));
  const merged = [...incoming];

  for (const item of existing) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }

  return merged;
};

const mergeBattleResults = (
  existing: NodeBattleResult[],
  incoming: NodeBattleResult[],
): NodeBattleResult[] => {
  const seen = new Set(existing.map((result) => `${result.node_id}-${result.step_resolved}-${result.outcome}-${result.false_positive}`));
  const merged = [...existing];

  for (const result of incoming) {
    const key = `${result.node_id}-${result.step_resolved}-${result.outcome}-${result.false_positive}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(result);
    }
  }

  return merged;
};

const alertTone = (alert: ThreatAlert): TelemetryLog['tone'] => {
  if (alert.severity === 'critical' || alert.severity === 'high') {
    return 'critical';
  }
  if (alert.is_likely_false_positive) {
    return 'warning';
  }
  return 'info';
};

const buildTelemetryEntries = (payload: StepMessage): TelemetryLog[] => {
  const entries: TelemetryLog[] = [
    {
      id: `red-${payload.step}-${payload.red_action.action_name}-${payload.red_action.target_host_id}-${Math.random().toString(36).substring(2,6)}`,
      team: 'red',
      type: payload.red_action.action_name,
      message: `${payload.red_action.action_name.replace(/_/g, ' ')} ${payload.red_action.success ? 'landed on' : 'stalled at'} ${payload.red_action.target_host_label}`,
      step: payload.step,
      tone: payload.red_action.success ? 'critical' : 'warning',
    },
    {
      id: `blue-${payload.step}-${payload.blue_action.action_name}-${payload.blue_action.target_host_id}`,
      team: 'blue',
      type: payload.blue_action.action_name,
      message: `${payload.blue_action.action_name.replace(/_/g, ' ')} ${payload.blue_action.success ? 'executed for' : 'missed'} ${payload.blue_action.target_host_label}`,
      step: payload.step,
      tone: payload.blue_action.is_false_positive ? 'warning' : payload.blue_action.success ? 'success' : 'info',
    },
  ];

  for (const alert of payload.new_alerts) {
    entries.push({
      id: `alert-${alert.id}`,
      team: 'system',
      type: alert.threat_type,
      message: `${alert.mitre_id} ${alert.headline}`,
      step: payload.step,
      tone: alertTone(alert),
    });
  }

  return entries;
};

const applyStreamPayload = (
  payload: StreamMessage,
  set: (partial: Partial<SimulationState> | ((state: SimulationState) => Partial<SimulationState>)) => void,
) => {
  set((state) => ({
    simulationId: payload.simulation_id || state.simulationId,
    network: payload.network,
    step: payload.step ?? payload.network.step ?? state.step,
    maxSteps: payload.max_steps ?? payload.network.max_steps ?? state.maxSteps,
    phase: payload.phase ?? payload.network.phase ?? state.phase,
    briefing: payload.briefing ?? state.briefing,
    contestEvents: payload.contest_events ?? state.contestEvents,
    battleResults: mergeBattleResults(state.battleResults, payload.battle_results ?? []),
    redQValues: payload.red_q_values ?? state.redQValues,
    bluePolicyProbs: payload.blue_policy_probs ?? state.bluePolicyProbs,
    scoreboard: payload.scoreboard ?? state.scoreboard,
    alerts:
      payload.type === 'step'
        ? mergeById(state.alerts, payload.new_alerts).slice(0, 32)
        : state.alerts,
    latestRedAction: payload.type === 'step' ? payload.red_action : state.latestRedAction,
    latestBlueAction: payload.type === 'step' ? payload.blue_action : state.latestBlueAction,
    redCumulative: payload.type === 'step' ? payload.red_cumulative : state.redCumulative,
    blueCumulative: payload.type === 'step' ? payload.blue_cumulative : state.blueCumulative,
    pipeline: payload.type === 'step' ? payload.pipeline : state.pipeline,
    episodeHistorySummary: payload.type === 'step' ? payload.episode_history_summary : state.episodeHistorySummary,
    killChain: payload.type === 'step' ? (payload.kill_chain ?? state.killChain) : state.killChain,
    aptAttribution: payload.type === 'step' ? (payload.apt_attribution ?? state.aptAttribution) : state.aptAttribution,
    logs:
      payload.type === 'step'
        ? [...buildTelemetryEntries(payload), ...state.logs].slice(0, 96)
        : state.logs,
    integrationEvents:
      payload.type === 'init'
        ? payload.integration_events || state.integrationEvents
        : state.integrationEvents,
  }));
};

const buildIntegrationTelemetryEntries = (payload: IntegrationEventMessage): TelemetryLog[] =>
  payload.events.slice(0, 8).map((event) => ({
    id: `external-${event.id}`,
    team: 'system',
    type: `${event.vendor}:${event.threat_type}`,
    message: `${event.vendor.toUpperCase()} ${payload.source.replace(/_/g, ' ')} flagged ${event.host_label} for ${event.threat_type.replace(/_/g, ' ')}`,
    step: payload.step,
    tone:
      event.severity === 'critical' || event.severity === 'high'
        ? 'critical'
        : event.severity === 'medium'
          ? 'warning'
          : 'info',
  }));

const applyIntegrationPayload = (
  payload: IntegrationEventMessage,
  set: (partial: Partial<SimulationState> | ((state: SimulationState) => Partial<SimulationState>)) => void,
) => {
  set((state) => {
    const knownIds = new Set(state.integrationEvents.map((event) => event.id));
    const newEvents = payload.events.filter((event) => !knownIds.has(event.id));
    return {
      simulationId: payload.simulation_id || state.simulationId,
      network: payload.network,
      step: payload.step ?? state.step,
      phase: payload.phase ?? state.phase,
      pipeline: payload.pipeline ?? state.pipeline,
      briefing: payload.briefing ?? state.briefing,
      killChain: payload.kill_chain ?? state.killChain,
      aptAttribution: payload.apt_attribution ?? state.aptAttribution,
      scoreboard: payload.scoreboard ?? state.scoreboard,
      alerts: mergeById(state.alerts, payload.new_alerts).slice(0, 32),
      integrationEvents: [...newEvents, ...state.integrationEvents].slice(0, 36),
      logs: [...buildIntegrationTelemetryEntries(payload), ...state.logs].slice(0, 96),
    };
  });
};

const initialState = {
  simulationId: null,
  isConnected: false,
  network: null,
  logs: [] as TelemetryLog[],
  alerts: [] as ThreatAlert[],
  step: 0,
  maxSteps: 100,
  phase: 'idle',
  briefing: null as BattleBriefing | null,
  scoreboard: null as BattleScoreboard | null,
  contestEvents: [] as ContestEvent[],
  battleResults: [] as NodeBattleResult[],
  redQValues: {} as Record<string, DecisionScores>,
  bluePolicyProbs: {} as Record<string, DecisionScores>,
  pipeline: null as PipelineState | null,
  latestRedAction: null as AgentAction | null,
  latestBlueAction: null as AgentAction | null,
  redCumulative: 0,
  blueCumulative: 0,
  episodeHistorySummary: [] as StepHistorySummary[],
  trainingMetrics: null as TrainingMetrics | null,
  agentsInfo: null as AgentsInfo | null,
  playbooks: [] as Playbook[],
  giskardStatus: null as GiskardStatus | null,
  giskardReports: [] as GiskardReport[],
  killChain: null as KillChainState | null,
  aptAttribution: [] as AptMatch[],
  integrationEvents: [] as IntegrationFeedEvent[],
  stepHistory: [] as StepMessage[],
  autoStep: false,
  autoStepInterval: null as number | null,
  _socket: null as WebSocket | null,
  _connectionAttempted: false,
  viewMode: '2d' as const,
  selectedNodeId: null as number | null,
};

export const useSimulationStore = create<SimulationState>((set, get) => ({
  ...initialState,
  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  apiBaseUrl: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://127.0.0.1:8001'),

  setApiBaseUrl: (url: string) => {
    const cleaned = url.trim().replace(/\/$/, '');
    set({ apiBaseUrl: cleaned });
    apiClient.defaults.baseURL = cleaned;
  },

  startSimulation: async () => {
    if (get().isConnected && get()._socket?.readyState === WebSocket.OPEN) {
      return;
    }

    const existingSocket = get()._socket;
    if (existingSocket) {
      try { existingSocket.close(); } catch { /* ignore */ }
    }

    set({
      ...initialState,
      apiBaseUrl: get().apiBaseUrl,
      _connectionAttempted: true,
    });

    try {
      const response = await apiClient.post('/api/simulation/create');
      const simulationId = String(response.data.simulation_id);
      const socket = new WebSocket(getWebSocketUrl(simulationId));

      socket.onopen = () => {
        set({ isConnected: true, _socket: socket, simulationId, stepHistory: [], autoStep: false });
        toast.success('Live battle stream connected');
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as StreamMessage | { type: string; message?: string; recoverable?: boolean };
          if (payload.type === 'init' || payload.type === 'step') {
            applyStreamPayload(payload as StreamMessage, set);
            if ((payload as StreamMessage).type === 'step') {
              set((state) => ({ stepHistory: [...state.stepHistory, payload as StepMessage] }));
            }
            return;
          }
          if (payload.type === 'integration_event') {
            applyIntegrationPayload(payload as IntegrationEventMessage, set);
            toast.success(payload.message || `${payload.vendor} events bridged into the War Room`, {
              id: `integration-${payload.ingested_at}`,
            });
            return;
          }
          if (payload.type === 'status' && payload.message) {
            toast(payload.message);
            return;
          }
          if (payload.type === 'error' && payload.message) {
            toast.error(payload.message);
          }
        } catch (parseError) {
          console.warn('[SimStore] Failed to parse WebSocket message:', parseError);
        }
      };

      socket.onerror = () => {
        // Only toast on first error, not on every retry
        if (get().isConnected) {
          toast.error('WebSocket connection lost');
        }
      };

      socket.onclose = () => {
        set({ isConnected: false, _socket: null });
      };
    } catch (error) {
      console.warn('[SimStore] Backend unreachable:', (error as Error).message);
      // Show a non-intrusive message — the user can manually reconnect
      toast.error('Backend offline — click "Connect Live Stream" when ready.', { duration: 4000, id: 'backend-offline' });
    }
  },

  generateStep: () => {
    const socket = get()._socket;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ command: 'step' }));
      return;
    }
    toast.error('Connect to a simulation before stepping');
  },

  resetSimulation: () => {
    const socket = get()._socket;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ command: 'reset' }));
      toast('Simulation reset requested');
      return;
    }
    toast.error('No active simulation to reset');
  },

  toggleAutoStep: () => {
    const current = get().autoStep;
    const existingInterval = get().autoStepInterval;
    if (existingInterval) window.clearInterval(existingInterval);

    if (current) {
      set({ autoStep: false, autoStepInterval: null });
      toast('Auto-step paused');
      return;
    }

    const interval = window.setInterval(() => {
      const socket = get()._socket;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ command: 'step' }));
      } else {
        const int = get().autoStepInterval;
        if (int) window.clearInterval(int);
        set({ autoStep: false, autoStepInterval: null });
      }
    }, 3000);

    set({ autoStep: true, autoStepInterval: interval });
    toast.success('Auto-step started (3s interval — one attack per tick)');
  },

  replayStep: (stepIndex: number) => {
    const history = get().stepHistory;
    if (stepIndex < 0 || stepIndex >= history.length) return;
    const snapshot = history[stepIndex];
    applyStreamPayload(snapshot, set);
  },

  triggerAttack: async (targetNode: number, threatType: ThreatType) => {
    const simulationId = get().simulationId;
    if (!simulationId) {
      toast.error('Start a simulation before triggering an attack');
      return;
    }

    try {
      await apiClient.post('/api/battle/trigger-attack', {
        sim_id: simulationId,
        target_node: targetNode,
        threat_type: threatType,
      });
      toast.success(`Queued ${threatType.replace(/_/g, ' ')} on node ${targetNode}`);
    } catch (error) {
      console.error(error);
      toast.error('Unable to trigger demo attack');
    }
  },

  loadTrainingMetrics: async () => {
    try {
      const response = await apiClient.get('/api/agents/training/metrics');
      set({ trainingMetrics: response.data as TrainingMetrics });
    } catch (error) {
      console.error(error);
      toast.error('Unable to load training metrics');
    }
  },

  loadAgentsInfo: async () => {
    try {
      const response = await apiClient.get('/api/agents/info');
      set({ agentsInfo: response.data as AgentsInfo });
    } catch (error) {
      console.error(error);
      toast.error('Unable to load agent metrics');
    }
  },

  loadPlaybooks: async () => {
    try {
      const response = await apiClient.get('/api/playbooks');
      set({ playbooks: response.data.playbooks as Playbook[] });
    } catch (error) {
      console.error(error);
      toast.error('Unable to load playbooks');
    }
  },

  generatePlaybook: async (alertId?: string) => {
    try {
      const response = await apiClient.post('/api/playbooks/generate', alertId ? { alert_id: alertId } : {});
      const playbook = response.data as Playbook;
      set((state) => ({
        playbooks: [playbook, ...state.playbooks.filter((item) => item.id !== playbook.id)],
      }));
      toast.success(`Generated playbook ${playbook.id}`);
      return playbook;
    } catch (error) {
      console.error(error);
      toast.error('Unable to generate playbook');
      return null;
    }
  },

  loadGiskardStatus: async () => {
    try {
      const response = await apiClient.get('/api/giskard/status');
      set({ giskardStatus: response.data as GiskardStatus });
    } catch (error) {
      console.error(error);
      toast.error('Unable to load Giskard status');
    }
  },

  loadGiskardReports: async () => {
    try {
      const response = await apiClient.get('/api/giskard/reports');
      set({ giskardReports: response.data.reports as GiskardReport[] });
    } catch (error) {
      console.error(error);
      toast.error('Unable to load Giskard reports');
    }
  },

  runGiskardScan: async (mode: 'blue' | 'red') => {
    try {
      await apiClient.post(`/api/giskard/scan/${mode}`);
      toast.success(`${mode.toUpperCase()} Giskard scan started`);
      await get().loadGiskardStatus();
      await get().loadGiskardReports();
    } catch (error) {
      console.error(error);
      toast.error(`Unable to start ${mode} Giskard scan`);
    }
  },

  uploadSIEMFeed: async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('siem_file', file);
      await apiClient.post('/api/simulation/upload-siem', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`SIEM feed uploaded: ${file.name}`);
      // Restart simulation with the uploaded data
      const existingSocket = get()._socket;
      if (existingSocket) {
        existingSocket.close();
      }
      await get().startSimulation();
    } catch (error) {
      console.error(error);
      toast.error('Unable to upload SIEM feed. Ensure the backend supports /api/simulation/upload-siem.');
    }
  },

  ingestUrlFeed: async (url: string, vendor = 'generic') => {
    try {
      const response = await apiClient.post(
        '/api/ingest/url',
        { url, vendor },
        {
          headers: {
            'X-API-Key': getEnterpriseApiKey(),
          },
        },
      );
      const result = response.data as {
        event_count?: number;
        bridge?: { bridged?: boolean };
        security_report?: { security_score?: number };
      };
      const securityNote = result.security_report?.security_score !== undefined
        ? ` · URL score ${result.security_report.security_score}/100`
        : '';
      toast.success(`Fetched ${result.event_count || 0} events from remote URL${securityNote}`);
      if (!result.bridge?.bridged) {
        const existingSocket = get()._socket;
        if (existingSocket) {
          existingSocket.close();
        }
        await get().startSimulation();
      }
    } catch (error) {
      console.error(error);
      toast.error('Unable to ingest the remote URL feed.');
    }
  },
}));
