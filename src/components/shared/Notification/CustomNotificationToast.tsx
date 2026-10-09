'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  AlertOctagon,
  AlertTriangle,
  Info,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { NotificationItem } from './types';

interface CustomNotificationToastProps {
  item: NotificationItem;
  onClose: (id: string) => void;
}

const SEVERITY_CONFIG = {
  success: {
    accentColor: '#10b981', // Emerald
    badgeBg: 'radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.3) 0%, rgba(16, 185, 129, 0.3) 50%, rgba(16, 185, 129, 0.1) 100%)',
    badgeBorder: 'rgba(52, 211, 153, 0.45)',
    iconColor: '#34d399',
    glowGradient: 'radial-gradient(200px circle at 0% 0%, rgba(16, 185, 129, 0.2), transparent 75%)',
    auraShadow: '0 0 20px -2px rgba(16, 185, 129, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.4)',
    actionBg: '#10b981',
    actionText: '#042f1a',
    defaultTitle: 'Success',
    Icon: Check
  },
  error: {
    accentColor: '#ef4444', // Crimson
    badgeBg: 'radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.3) 0%, rgba(239, 68, 68, 0.3) 50%, rgba(239, 68, 68, 0.1) 100%)',
    badgeBorder: 'rgba(248, 113, 113, 0.45)',
    iconColor: '#f87171',
    glowGradient: 'radial-gradient(200px circle at 0% 0%, rgba(239, 68, 68, 0.2), transparent 75%)',
    auraShadow: '0 0 20px -2px rgba(239, 68, 68, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.4)',
    actionBg: '#ef4444',
    actionText: '#ffffff',
    defaultTitle: 'Error',
    Icon: AlertOctagon
  },
  warning: {
    accentColor: '#f59e0b', // Amber Gold
    badgeBg: 'radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.3) 0%, rgba(245, 158, 11, 0.3) 50%, rgba(245, 158, 11, 0.1) 100%)',
    badgeBorder: 'rgba(251, 191, 36, 0.45)',
    iconColor: '#fbbf24',
    glowGradient: 'radial-gradient(200px circle at 0% 0%, rgba(245, 158, 11, 0.2), transparent 75%)',
    auraShadow: '0 0 20px -2px rgba(245, 158, 11, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.4)',
    actionBg: '#f59e0b',
    actionText: '#451a03',
    defaultTitle: 'Attention',
    Icon: AlertTriangle
  },
  info: {
    accentColor: '#6366f1', // Indigo
    badgeBg: 'radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.3) 0%, rgba(99, 102, 241, 0.3) 50%, rgba(99, 102, 241, 0.1) 100%)',
    badgeBorder: 'rgba(129, 140, 248, 0.45)',
    iconColor: '#818cf8',
    glowGradient: 'radial-gradient(200px circle at 0% 0%, rgba(99, 102, 241, 0.2), transparent 75%)',
    auraShadow: '0 0 20px -2px rgba(99, 102, 241, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.4)',
    actionBg: '#6366f1',
    actionText: '#ffffff',
    defaultTitle: 'Information',
    Icon: Info
  }
};

export const CustomNotificationToast: React.FC<CustomNotificationToastProps> = ({
  item,
  onClose
}) => {
  const { id, title, message, severity, duration = 4500, action, details } = item;
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.info;
  const { Icon } = config;

  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [progress, setProgress] = useState(100);

  const remainingTimeRef = useRef<number>(duration);
  const animationFrameRef = useRef<number | null>(null);

  // Countdown timer with pause on hover
  useEffect(() => {
    if (!duration || duration <= 0) return;

    let lastTick = Date.now();

    const tick = () => {
      const now = Date.now();
      const delta = now - lastTick;
      lastTick = now;

      if (!isHovered) {
        remainingTimeRef.current -= delta;
        const pct = Math.max(0, (remainingTimeRef.current / duration) * 100);
        setProgress(pct);

        if (remainingTimeRef.current <= 0) {
          onClose(id);
          return;
        }
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [id, duration, isHovered, onClose]);

  const handleActionClick = useCallback(() => {
    if (action?.onClick) {
      action.onClick(id);
    }
    onClose(id);
  }, [action, id, onClose]);

  const resolvedTitle = title || config.defaultTitle;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.92, y: -12, filter: 'blur(4px)', transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 440, damping: 30 }}
      drag="x"
      dragConstraints={{ left: 0, right: 300 }}
      dragElastic={0.4}
      onDragEnd={(_, info) => {
        if (info.offset.x > 80 || info.velocity.x > 300) {
          onClose(id);
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role={severity === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 440,
        backgroundColor: 'rgba(15, 23, 42, 0.82)', // Liquid Frosted Slate Navy
        backdropFilter: 'blur(20px) saturate(190%)',
        WebkitBackdropFilter: 'blur(20px) saturate(190%)',
        borderRadius: 12, // Minor rounded corners as requested
        border: '1px solid rgba(255, 255, 255, 0.14)',
        boxShadow:
          '0 20px 36px -8px rgba(0, 0, 0, 0.58), 0 8px 18px -4px rgba(0, 0, 0, 0.32), inset 0 1px 1px 0 rgba(255, 255, 255, 0.2)',
        overflow: 'hidden',
        pointerEvents: 'auto',
        cursor: 'grab',
        userSelect: 'none'
      }}
    >
      {/* Top Specular Light Reflection */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '50%',
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.02) 40%, transparent 65%)',
          pointerEvents: 'none',
          borderRadius: 12
        }}
      />

      {/* Semantic Liquid Ambient Glow */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: config.glowGradient,
          pointerEvents: 'none',
          borderRadius: 12
        }}
      />

      {/* Main Toast Content */}
      <div style={{ position: 'relative', padding: '13px 16px', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Glass Icon Orb with subtle rounded squircle */}
          <div
            style={{
              flexShrink: 0,
              width: 38,
              height: 38,
              borderRadius: 10, // Minor rounded badge
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: config.badgeBg,
              border: `1.2px solid ${config.badgeBorder}`,
              boxShadow: config.auraShadow
            }}
          >
            <Icon size={20} color={config.iconColor} strokeWidth={2.5} />
          </div>

          {/* Title & Body Message */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 2
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: '0.875rem',
                  fontWeight: 650,
                  letterSpacing: '-0.01em',
                  color: '#ffffff',
                  lineHeight: 1.3
                }}
              >
                {resolvedTitle}
              </h4>
            </div>

            <div
              style={{
                fontSize: '0.8125rem',
                color: 'rgba(226, 232, 240, 0.88)', // Slate 200 high contrast
                lineHeight: 1.42,
                wordBreak: 'break-word',
                fontWeight: 400
              }}
            >
              {message}
            </div>

            {/* Actions & Details Controls */}
            {(action || details) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 8
                }}
              >
                {action && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleActionClick();
                    }}
                    style={{
                      background: action.variant === 'solid' ? config.actionBg : 'rgba(255, 255, 255, 0.1)',
                      border: `1px solid ${action.variant === 'solid' ? config.accentColor : 'rgba(255, 255, 255, 0.18)'}`,
                      color: action.variant === 'solid' ? config.actionText : '#ffffff',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      padding: '4px 12px',
                      borderRadius: 6, // Minor rounded button
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      outline: 'none',
                      boxShadow: action.variant === 'solid' ? `0 2px 8px ${config.accentColor}40` : 'none'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    {action.label}
                  </button>
                )}

                {details && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDetails((prev) => !prev);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                      padding: '3px 6px',
                      borderRadius: 4,
                      outline: 'none'
                    }}
                  >
                    {showDetails ? 'Hide details' : 'View details'}
                    {showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                )}
              </div>
            )}

            {/* Expandable Technical Details */}
            {details && showDetails && (
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  backgroundColor: 'rgba(0, 0, 0, 0.45)',
                  borderRadius: 8,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  fontSize: '0.725rem',
                  fontFamily: 'monospace',
                  color: '#cbd5e1',
                  maxHeight: 120,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all'
                }}
              >
                {typeof details === 'string' ? details : JSON.stringify(details, null, 2)}
              </div>
            )}
          </div>

          {/* Minimal Glass Close Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose(id);
            }}
            aria-label="Dismiss notification"
            style={{
              flexShrink: 0,
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 6, // Minor rounded close button
              color: 'rgba(255, 255, 255, 0.65)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              outline: 'none',
              padding: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.65)';
            }}
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* Bottom Progress Bar */}
      {duration > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 2.5,
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            overflow: 'hidden',
            borderRadius: '0 0 12px 12px'
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              backgroundColor: config.accentColor,
              boxShadow: `0 0 6px ${config.accentColor}`,
              transition: isHovered ? 'none' : 'width 60ms linear'
            }}
          />
        </div>
      )}
    </motion.div>
  );
};
