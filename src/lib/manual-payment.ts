export interface ManualPaymentConfig {
  bankId: string;
  bankName: string;
  accountNo: string;
  accountName: string;
}

export interface ManualPaymentDetails extends ManualPaymentConfig {
  amount: number;
  transferNote: string;
  qrPayload: string;
  qrImageUrl: string | null;
}

export function normalizeDiscountPercent(value: number | string | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(99.99, Math.max(0, parsed));
}

export function getDiscountedAmount(
  amount: number | string,
  discountPercent: number | string | null | undefined,
) {
  const normalizedAmount = toNumber(amount);
  const normalizedDiscount = normalizeDiscountPercent(discountPercent);

  return Math.max(
    0,
    Math.round(normalizedAmount * (1 - normalizedDiscount / 100)),
  );
}

function toNumber(value: string | number | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildTransferNote(orderId: string) {
  const compactId = orderId.replace(/-/g, "").slice(0, 12).toUpperCase();
  return `GPDT-${compactId}`;
}

export function buildQrPayload(
  transferNote: string,
  amount: number,
  config: ManualPaymentConfig,
) {
  return JSON.stringify({
    bankId: config.bankId,
    accountNo: config.accountNo,
    amount,
    transferNote,
  });
}

export function buildVietQrImageUrl(
  transferNote: string,
  amount: number,
  config: ManualPaymentConfig,
) {
  if (!config.bankId || !config.accountNo || !config.accountName) {
    return null;
  }

  const params = new URLSearchParams({
    amount: String(Math.round(amount)),
    addInfo: transferNote,
    accountName: config.accountName,
  });

  return `https://img.vietqr.io/image/${encodeURIComponent(config.bankId)}-${encodeURIComponent(config.accountNo)}-compact2.png?${params.toString()}`;
}

export function buildManualPaymentDetails(input: {
  amount: number | string;
  transferNote: string;
  config: ManualPaymentConfig;
}): ManualPaymentDetails {
  const amount = toNumber(input.amount);

  return {
    ...input.config,
    amount,
    transferNote: input.transferNote,
    qrPayload: buildQrPayload(input.transferNote, amount, input.config),
    qrImageUrl: buildVietQrImageUrl(input.transferNote, amount, input.config),
  };
}
