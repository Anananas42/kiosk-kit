export enum PollInterval {
  /** Default device status polling */
  DeviceStatus = 5_000,
  /** During active file upload to device */
  Uploading = 3_000,
  /** During install/reboot */
  Installing = 5_000,
  /** Server-side operation status when device is unreachable */
  ServerStatus = 5_000,
}
