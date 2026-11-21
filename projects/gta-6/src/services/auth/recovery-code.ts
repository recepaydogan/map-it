/** Length used by this project's emailed password-recovery tokens. */
export const RECOVERY_CODE_LENGTH = 8;
export const RECOVERY_CODE_PATTERN = `[0-9]{${RECOVERY_CODE_LENGTH}}`;
const recoveryCode = new RegExp(`^${RECOVERY_CODE_PATTERN}$`);

export const isValidRecoveryCode = (code: string): boolean => recoveryCode.test(code);
