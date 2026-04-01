import { StateModel } from '../asm/state-model';
const model = new StateModel();
export function inspectState() { return model.get(); }
