import { uiText } from '../services/uiText.js';
/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useId, type ReactNode } from 'react';
import { CloseIcon, DeviceIcon, ShieldIcon } from '../components/Icons.js';
import { Switch } from '../components/Switch.js';

export interface SettingsScreenProps {
  cloudSettings?: ReactNode;
  sensitiveActionAlerts: boolean;
  onToggleSensitiveActionAlerts: () => void;
  onDeviceModel: boolean;
  onToggleOnDeviceModel: () => void;
  onDeviceModelSupported: boolean;
  /** A response is being generated, which the model must not change under. */
  responseInProgress?: boolean;
  onClose: () => void;
}

/**
 * SettingsScreen Component
 * Presents settings options, currently featuring the Sensitive action alerts permission toggle.
 */
export function SettingsScreen({
  cloudSettings,
  sensitiveActionAlerts,
  onToggleSensitiveActionAlerts,
  onDeviceModel,
  onToggleOnDeviceModel,
  onDeviceModelSupported,
  responseInProgress = false,
  onClose,
}: SettingsScreenProps) {
  const alertsDescId = useId();
  const modelDescId = useId();
  const modelLockedId = useId();
  const modelLocked = onDeviceModelSupported && responseInProgress;

  return (
    <div className="settings-view">
      <div className="settings-card">
        {/* Header */}
        <div className="settings-card__header">
          <h1 className="settings-title">{cloudSettings ? 'Cài đặt' : uiText("Settings", "Cài đặt")}</h1>
          <button
            type="button"
            className="settings-close-btn"
            onClick={onClose}
            aria-label={uiText("Close settings", "Đóng cài đặt")}
            title={uiText("Close settings", "Đóng cài đặt")}
          >
            <CloseIcon size={20} color="var(--color-blue-title)" />
          </button>
        </div>

        {cloudSettings}
        {/* Permissions Section */}
        <div className="settings-section">
          <h2 className="settings-section__title">{cloudSettings ? 'Quyền thao tác' : uiText("Permissions", "Quyền thao tác")}</h2>

          <div className="settings-item">
            <div className="settings-item__icon">
              <ShieldIcon size={24} color="var(--color-on-surface-variant)" />
            </div>
            <div className="settings-item__content">
              <span className="settings-item__title">{cloudSettings ? 'Hỏi trước khi thao tác' : uiText("Sensitive action alerts", "Hỏi trước khi thao tác")}</span>
              <p id={alertsDescId} className="settings-item__desc">
                {cloudSettings ? 'Xin phép trước khi công cụ thay đổi dữ liệu hoặc tài khoản của bạn.' : 'Get a prompt before tools make changes to your data or accounts. Some external tools may not support this.'}
              </p>
            </div>
            <div className="settings-item__control">
              <Switch
                checked={sensitiveActionAlerts}
                onChange={onToggleSensitiveActionAlerts}
                aria-label={uiText("Sensitive action alerts", "Hỏi trước khi thao tác")}
                aria-describedby={alertsDescId}
              />
            </div>
          </div>
        </div>

        {/* Model Section */}
        {!cloudSettings && <div className="settings-section">
          <h2 className="settings-section__title">{uiText("Model", "Mô hình AI")}</h2>

          <div className="settings-item">
            <div className="settings-item__icon">
              <DeviceIcon size={24} color="var(--color-on-surface-variant)" />
            </div>
            <div className="settings-item__content">
              <span className="settings-item__title">On-device model</span>
              <p id={modelDescId} className="settings-item__desc">
                {onDeviceModelSupported
                  ? 'Run the model in your browser with the Prompt API, instead of sending prompts and page data to the backend server. No API key needed.'
                  : 'Unavailable: this browser does not expose the Prompt API. Prompts go to the backend server.'}
              </p>
              {modelLocked && (
                <p id={modelLockedId} className="settings-item__desc">
                  Can be changed once the current response has finished.
                </p>
              )}
            </div>
            <div className="settings-item__control">
              <Switch
                checked={onDeviceModel}
                onChange={onToggleOnDeviceModel}
                disabled={!onDeviceModelSupported || responseInProgress}
                aria-label="On-device model"
                aria-describedby={modelLocked ? `${modelDescId} ${modelLockedId}` : modelDescId}
              />
            </div>
          </div>
        </div>}
      </div>
    </div>
  );
}
