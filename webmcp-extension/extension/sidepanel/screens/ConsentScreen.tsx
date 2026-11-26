import { uiText } from '../services/uiText.js';
/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SymbolIcon } from '../components/Icons.js';

export interface ConsentScreenProps {
  onGotIt?: () => void;
  onClose?: () => void;
}

interface FeatureItem {
  id: string;
  icon: string;
  title: string;
  description: React.ReactNode;
}

const CONSENT_FEATURES: FeatureItem[] = [
  {
    id: 'goals',
    icon: 'automation',
    title: uiText("Reach your goals, faster", "Xử lý công việc nhanh hơn"),
    description: uiText("Get things done faster by using WebMCP provided by the site", "Sử dụng công cụ WebMCP do trang công bố để xử lý công việc."),
  },
  {
    id: 'sites',
    icon: 'sites',
    title: uiText("Use it on trusted sites", "Sử dụng trên trang đáng tin cậy"),
    description: uiText("You may share personal info with the sites", "Nội dung bạn cung cấp có thể được chia sẻ với trang đang sử dụng."),
  },
  {
    id: 'control',
    icon: 'shield',
    title: uiText("Stay in control", "Bạn luôn kiểm soát"),
    description: uiText("Shows the steps when appropriate and asks confirmations before the sensitive ones", "Theo dõi các bước thực hiện và xác nhận trước những thao tác nhạy cảm."),
  },
  {
    id: 'terms',
    icon: 'description',
    title: uiText("Terms & Notices", "Thông tin sử dụng"),
    description: (
      <>
        <a href="#" className="consent__link" onClick={(e) => e.preventDefault()}>{uiText("Terms", "Điều khoản")}</a>{uiText(' and the ', ' và ')}
        <a href="#" className="consent__link" onClick={(e) => e.preventDefault()}>{uiText("Privacy Notice", "Thông báo quyền riêng tư")}</a>{uiText(' apply. AI agents can make mistakes, so double-check it.', ' được áp dụng. AI có thể mắc lỗi; hãy kiểm tra kết quả trước khi sử dụng.')}
      </>
    ),
  },
];

/**
 * ConsentScreen Component
 * Reuses the welcome card layout with identical "Hi there!" heading & subtitle styling.
 */
export function ConsentScreen({ onGotIt, onClose }: ConsentScreenProps) {
  return (
    <div className="consent-view">
      <div className="consent__content welcome-card">
        {/* Welcome Greeting Header matching Chat view */}
        <div>
          <h1 className="welcome-title">{uiText("Hi there!", "Xin chào!")}</h1>
          <p className="welcome-subtitle">{uiText("Get help with your tabs and tasks with ‘Agent’", "Cùng Mbee hỏi đáp và sử dụng công cụ trên trang.")}</p>
        </div>

        {/* Feature List Container */}
        <div className="consent__feature-card">
          {CONSENT_FEATURES.map((feature) => (
            <div key={feature.id} className="consent__feature-item">
              <div className="consent__feature-icon">
                <SymbolIcon name={feature.icon} size={20} color="#012c6f" />
              </div>
              <div className="consent__feature-text">
                <h4 className="consent__feature-title">{feature.title}</h4>
                <p className="consent__feature-desc">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <p className="consent__disclaimer">
          {uiText('Available WebMCP tools enables AI agents to perform actions quicker.', 'Các công cụ WebMCP giúp Mbee thực hiện công việc trên trang.')} {' '}
          <a href="#" className="consent__link" onClick={(e) => e.preventDefault()}>{uiText("Learn more about tools and WebMCP", "Tìm hiểu về công cụ WebMCP")}</a>
        </p>

        {/* Action Buttons */}
        <div className="consent__actions">
          <button type="button" className="consent__btn consent__btn--secondary" onClick={onClose}>{uiText("Close", "Đóng")}</button>
          <button type="button" className="consent__btn consent__btn--primary" onClick={onGotIt}>{uiText("Got it", "Đã hiểu")}</button>
        </div>
      </div>
    </div>
  );
}
