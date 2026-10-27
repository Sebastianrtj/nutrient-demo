import type { ReceivingDetails, Shipment } from './contracts';

export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function receivingDefaults(shipment: Shipment, receiverName = ''): ReceivingDetails {
  return { receiverName, receivedDate: localDate(), palletsReceived: shipment.pallets, exceptions: '' };
}
export function receivingError(value: ReceivingDetails, expectedPallets: number): string {
  if (!value.receiverName.trim() || value.receiverName.trim().length > 60) return 'Enter the receiver’s name (up to 60 characters).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.receivedDate) || !Number.isFinite(Date.parse(value.receivedDate + 'T12:00:00Z')) || new Date(value.receivedDate + 'T12:00:00Z').toISOString().slice(0, 10) !== value.receivedDate) return 'Choose a valid receiving date.';
  if (!Number.isInteger(value.palletsReceived) || value.palletsReceived < 0 || value.palletsReceived > 999) return 'Enter a whole pallet count from 0 to 999.';
  if (value.exceptions.length > 200) return 'Keep exceptions to 200 characters.';
  if (value.palletsReceived !== expectedPallets && !value.exceptions.trim()) return 'Note the pallet difference before signing.';
  return '';
}
