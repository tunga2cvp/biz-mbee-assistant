import { uiText } from '../services/uiText.js';
/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SymbolIcon } from './Icons.js';

export interface ToolCheckpointCardProps {
  /** Rounds of tool calls the request has run so far. */
  roundsUsed: number;
  /** The most rounds it may take if the user lets it go on. */
  maxRounds: number;
  onAllow: () => void;
  onDeny: () => void;
}

/**
 * ToolCheckpointCard Component
 * Asks once whether the agent may keep using tools. It is built from the tool
 * permission card's parts and shown in the same place, so it looks the same.
 */
export function ToolCheckpointCard({ roundsUsed, maxRounds, onAllow, onDeny }: ToolCheckpointCardProps) {
  return (
    <div
      className="tool-permission-card"
      role="alertdialog"
      aria-labelledby="checkpoint-title"
      aria-describedby="checkpoint-details"
    >
      <div className="tool-permission-card__header">
        <div className="tool-permission-card__icon-wrapper">
          <SymbolIcon name="pause_circle" size={24} color="var(--color-blue-title)" />
        </div>
        <div className="tool-permission-card__title-group">
          <h3 id="checkpoint-title" className="tool-permission-card__title">{uiText("Keep going?", "Tiếp tục thực hiện?")}</h3>
          <p className="tool-permission-card__subtitle">{uiText("The agent wants to use more tools for this request.", "Mbee cần gọi thêm công cụ để hoàn thành yêu cầu.")}</p>
        </div>
      </div>

      <div id="checkpoint-details" className="tool-permission-card__box">
        <div className="tool-permission-card__tool-name-container">
          <span className="tool-permission-card__tool-name">{uiText(`Used tools ${roundsUsed} times`, `Đã gọi công cụ ${roundsUsed} lượt`)}</span>
        </div>
        <div className="tool-permission-card__tool-desc-container">
          <span className="tool-permission-card__tool-desc">
            {uiText(`If you continue, it can use tools up to ${maxRounds} times in total, then it stops.`, `Nếu tiếp tục, Mbee sẽ gọi công cụ tối đa ${maxRounds} lượt tổng cộng rồi dừng.`)}
          </span>
        </div>
      </div>

      <div className="tool-permission-card__actions">
        <button
          type="button"
          className="tool-permission-card__btn tool-permission-card__btn--deny"
          onClick={onDeny}
        >{uiText("Stop", "Dừng")}</button>
        <button
          type="button"
          className="tool-permission-card__btn tool-permission-card__btn--allow"
          onClick={onAllow}
        >{uiText("Continue", "Tiếp tục")}</button>
      </div>
    </div>
  );
}
