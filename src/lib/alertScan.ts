import { scanLiveAlerts } from "./push";
// fire-and-forget com proteção: o scan nunca derruba a resposta principal
export function scanLiveAlertaSafe() {
  scanLiveAlerts().catch(() => {});
}