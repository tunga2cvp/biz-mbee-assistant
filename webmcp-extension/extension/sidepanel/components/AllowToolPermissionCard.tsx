import { uiText } from '../services/uiText.js';
/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShieldIcon, SymbolIcon } from './Icons.js';

export interface AllowToolPermissionCardProps {
  toolName: string;
  toolDescription?: string;
  /**
   * The origin the tool belongs to, such as `https://example.com`. Shown on the
   * always-allow button so it is clear how far the permission reaches.
   */
  origin?: string;
  /**
   * The page marked this tool `consequentialHint`: running it may do something
   * that may be irreversible. Shows a warning and withholds the session-grant
   * button however the caller was configured.
   */
  consequential?: boolean;
  onAllow: () => void;
  /**
   * Allow this tool for the rest of the session. The button is left out when
   * this is missing, which is the case for a page with no origin to remember.
   */
  onAlwaysAllow?: () => void;
  onDeny: () => void;
}

/**
 * Turns an origin into what the button says, dropping the scheme and any
 * default port so `https://example.com` reads as `example.com`.
 */
function labelForOrigin(origin?: string): string {
  if (!origin) return '';
  try {
    const { host } = new URL(origin);
    return host;
  } catch {
    return origin;
  }
}

/**
 * AllowToolPermissionCard Component
 * Displays user prompt before executing a non-readonly tool, allowing or denying the action.
 *
 * A `consequential` tool gets a louder variant of the same card: the action may
 * not be reversible, so it is always confirmed and never remembered.
 */
export function AllowToolPermissionCard({
  toolName,
  toolDescription,
  origin,
  consequential = false,
  onAllow,
  onAlwaysAllow,
  onDeny,
}: AllowToolPermissionCardProps) {
  const siteLabel = labelForOrigin(origin);
  // "Always" would promise more than this does. The grant lasts until the chat
  // is reset or the panel closes, and that has to be on the button itself: a
  // `title` is not read out by a screen reader that already has a label, and
  // never appears on touch.
  const alwaysAllowLabel = siteLabel ? uiText(`Allow on ${siteLabel} for this chat`, `Cho phép trên ${siteLabel} trong cuộc trò chuyện này`) : uiText("Allow for this chat", "Cho phép trong cuộc trò chuyện này");

  // Belt and braces: the hook already withholds the callback for a consequential
  // tool, and the card refuses to draw the button even if one is handed to it.
  const showAlwaysAllow = Boolean(onAlwaysAllow) && !consequential;

  const classNames = ['tool-permission-card'];
  if (consequential) classNames.push('tool-permission-card--consequential');

  return (
    <div
      className={classNames.join(' ')}
      role="alertdialog"
      aria-labelledby="permission-title"
      aria-describedby={consequential ? 'permission-warning' : 'permission-details'}
    >
      {/* Header section with Shield Icon and Titles */}
      <div className="tool-permission-card__header">
        <div className="tool-permission-card__icon-wrapper">
          {consequential ? (
            <SymbolIcon name="warning" size={24} fill={1} color="var(--color-error)" />
          ) : (
            <ShieldIcon size={24} color="var(--color-blue-title)" />
          )}
        </div>
        <div className="tool-permission-card__title-group">
          <h3 id="permission-title" className="tool-permission-card__title">
            {consequential ? uiText("This action may be irreversible", "Thao tác có thể không hoàn tác được") : uiText("Allow tool actions", "Cho phép sử dụng công cụ?")}
          </h3>
          <p className="tool-permission-card__subtitle">
            {consequential
              ? uiText("Check the details before you continue.", "Kiểm tra thông tin trước khi tiếp tục.")
              : uiText("Let this tool complete task for you", "Công cụ sẽ thực hiện yêu cầu thay bạn.")}
          </p>
        </div>
      </div>

      {/* Tool details box (1 tool display) */}
      <div id="permission-details" className="tool-permission-card__box">
        <div className="tool-permission-card__tool-name-container">
          <span className="tool-permission-card__tool-name">{toolName}</span>
        </div>
        <div className="tool-permission-card__tool-desc-container">
          <span className="tool-permission-card__tool-desc">
            {toolDescription || uiText("No description provided for this tool.", "Trang chưa cung cấp mô tả cho công cụ này.")}
          </span>
        </div>
      </div>

      {consequential && (
        <p id="permission-warning" className="tool-permission-card__warning">
          {uiText(`${siteLabel ? `${siteLabel} says this` : 'This'} action may not be possible to reverse (such as a payment, order, message, or deletion). You will always be asked to confirm, even if alerts are turned off.`, `${siteLabel ? `${siteLabel} cho biết: ` : ''}thao tác có thể không hoàn tác được, như thanh toán, đặt hàng, gửi tin nhắn hoặc xóa dữ liệu. Bạn luôn phải xác nhận, kể cả khi tắt cảnh báo.`)}
        </p>
      )}

      {/* Action Buttons */}
      <div className="tool-permission-card__actions">
        <button
          type="button"
          className="tool-permission-card__btn tool-permission-card__btn--deny"
          onClick={onDeny}
        >
          {consequential ? uiText("Cancel", "Hủy") : uiText("Don’t allow", "Không cho phép")}
        </button>
        <button
          type="button"
          className="tool-permission-card__btn tool-permission-card__btn--allow"
          onClick={onAllow}
        >{uiText("Allow", "Cho phép")}</button>
      </div>

      {showAlwaysAllow && (
        <button
          type="button"
          className="tool-permission-card__btn tool-permission-card__btn--always"
          onClick={onAlwaysAllow}
          title={uiText(`Allow ${toolName}${siteLabel ? ` on ${siteLabel}` : ''} without asking again in this chat`, `Cho phép ${toolName} trong cuộc trò chuyện này mà không hỏi lại`)}
        >
          {alwaysAllowLabel}
        </button>
      )}
    </div>
  );
}
