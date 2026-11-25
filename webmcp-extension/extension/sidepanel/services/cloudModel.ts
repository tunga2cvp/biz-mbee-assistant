import catalog from '../../../shared/cloudModels.json';

export const CLOUD_MODELS = catalog.models;
const MODEL_KEY = 'mbeeCloudModel';
let selectedModel: string | undefined;

export function getCloudModel(): string {
  if (selectedModel) return selectedModel;
  let saved: string | null = null;
  try { saved = localStorage.getItem(MODEL_KEY); } catch { /* default */ }
  selectedModel = CLOUD_MODELS.some(model => model.id === saved) ? saved! : catalog.defaultModel;
  return selectedModel;
}

export function selectCloudModel(id: string): void {
  if (!CLOUD_MODELS.some(model => model.id === id)) throw Error('Model không được hỗ trợ.');
  selectedModel = id;
  try { localStorage.setItem(MODEL_KEY, id); } catch { /* selection still works for this panel */ }
}
