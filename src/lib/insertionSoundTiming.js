const SECONDS_PER_DAY = 24 * 60 * 60;

export const INSERTION_SOUND_LEAD_SECONDS = 30;

function clockTimeToSeconds(value = "") {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return (hours * 60 * 60) + (minutes * 60) + seconds;
}

function secondsToClockTime(value = 0) {
  const normalized = ((Number(value) % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const seconds = normalized % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatClockTimeWithSeconds(date = new Date()) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function getInsertionSoundTriggerTime(scheduledTime = "") {
  const scheduledSeconds = clockTimeToSeconds(scheduledTime);
  if (scheduledSeconds === null) return "";
  return secondsToClockTime(scheduledSeconds - INSERTION_SOUND_LEAD_SECONDS);
}

export function isInsertionSoundDue(scheduledTime = "", currentTime = "") {
  const scheduledSeconds = clockTimeToSeconds(scheduledTime);
  const currentSeconds = clockTimeToSeconds(currentTime);
  if (scheduledSeconds === null || currentSeconds === null) return false;

  const triggerSeconds = (scheduledSeconds - INSERTION_SOUND_LEAD_SECONDS + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const secondsSinceTrigger = (currentSeconds - triggerSeconds + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  return secondsSinceTrigger < INSERTION_SOUND_LEAD_SECONDS;
}
