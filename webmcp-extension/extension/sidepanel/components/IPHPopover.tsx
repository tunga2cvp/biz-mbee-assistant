import { uiText } from '../services/uiText.js';
/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SymbolIcon } from './Icons.js';

const TITLE = uiText("Available WebMCP tools", "Công cụ WebMCP của trang");

export interface IPHPopoverProps {
  onClose?: () => void;
  onViewActions?: () => void;
  onGotIt?: () => void;
}

/**
 * IPHPopover Component
 */
export function IPHPopover({
  onClose,
  onViewActions,
  onGotIt,
}: IPHPopoverProps) {
  return (
    <div
      className="iph"
      role="region"
      aria-label={TITLE}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onClose) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="iph__card">
        <button
          type="button"
          className="iph__close-btn"
          onClick={onClose}
          aria-label={uiText("Close", "Đóng")}
        >
          <SymbolIcon name="close" size={16} color="#ffffff" />
        </button>

        <div className="iph__content">
          <h4 className="iph__title">{TITLE}</h4>
          <p className="iph__desc">
            {uiText('Available WebMCP tools enables AI agents to perform actions quicker. You can always review available tools on a page.', 'Mbee có thể sử dụng các công cụ do trang công bố. Bạn có thể xem danh sách công cụ bất cứ lúc nào.')}
          </p>
          <a
            href="#"
            className="iph__link"
            onClick={(e) => {
              e.preventDefault();
              if (onViewActions) onViewActions();
            }}
          >{uiText("Learn more about tools and WebMCP.", "Tìm hiểu về công cụ WebMCP.")}</a>
        </div>

        <div className="iph__footer">
          {onViewActions && (
            <button
              type="button"
              className="iph__btn iph__btn--secondary"
              onClick={onViewActions}
            >{uiText("View actions", "Xem công cụ")}</button>
          )}
          <button
            type="button"
            className="iph__btn iph__btn--primary"
            onClick={onGotIt}
          >{uiText("Got it", "Đã hiểu")}</button>
        </div>
      </div>
      <div className="iph__pointer" aria-hidden="true"></div>
    </div>
  );
}
