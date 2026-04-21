const OPENCLAW_SUPERVISOR_ENV_KEYS = [
  'LAUNCH_JOB_LABEL',
  'LAUNCH_JOB_NAME',
  'INVOCATION_ID',
  'NOTIFY_SOCKET',
  'MAINPID',
  'SYSTEMD_EXEC_PID',
  'JOURNAL_STREAM',
  'OPENCLAW_WINDOWS_TASK_NAME',
  'OPENCLAW_SERVICE_MARKER',
  'OPENCLAW_SERVICE_KIND',
] as const;

export function stripOpenClawSupervisorEnv(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const next = { ...env };
  for (const key of OPENCLAW_SUPERVISOR_ENV_KEYS) {
    delete next[key];
  }
  return next;
}

export { OPENCLAW_SUPERVISOR_ENV_KEYS };
