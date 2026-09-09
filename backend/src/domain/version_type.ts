export enum VersionType {
  STANDARD = 'standard',
  COVER = 'cover',
  REMIX = 'remix',
  ACOUSTIC = 'acoustic',
  LIVE = 'live',
}

export const VALID_VERSION_TYPES: readonly VersionType[] = Object.values(VersionType);

export function isVersionType(value: unknown): value is VersionType {
  return typeof value === 'string' && VALID_VERSION_TYPES.includes(value as VersionType);
}

export function parseVersionType(value: unknown, defaultType = VersionType.STANDARD): VersionType {
  if (isVersionType(value)) {
    return value;
  }
  return defaultType;
}
