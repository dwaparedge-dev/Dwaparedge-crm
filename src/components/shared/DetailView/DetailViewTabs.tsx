'use client';
/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
/* eslint-disable react-hooks/exhaustive-deps */

import React, { useEffect, useCallback } from 'react';
import { Box, Tabs, Tab, Stack, useTheme, Paper } from '@mui/material';

export interface DetailViewTabItem {
    label: string;
    key?: string;
    icon?: React.ReactElement;
    count?: number | string;
    badgeLabel?: string;
    badgeColor?: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
}

export interface DetailViewTabsProps {
    tabs: DetailViewTabItem[];
    activeTab: number;
    onChange: (tabIndex: number) => void;
    syncWithUrl?: boolean;
    urlParamName?: string;
    children?: React.ReactNode;
}

export const DetailViewTabs: React.FC<DetailViewTabsProps> = ({
    tabs,
    activeTab,
    onChange,
    syncWithUrl = true,
    urlParamName = 'tab',
    children
}) => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    // Synchronize initial tab from URL on mount
    useEffect(() => {
        if (!syncWithUrl || typeof window === 'undefined') return;

        try {
            const urlParams = new URLSearchParams(window.location.search);
            const tabParam = urlParams.get(urlParamName);
            if (tabParam) {
                // Find tab index matching key or numeric index
                const matchedIndex = tabs.findIndex(
                    (t, i) => (t.key && t.key.toLowerCase() === tabParam.toLowerCase()) || String(i) === tabParam
                );
                if (matchedIndex >= 0 && matchedIndex !== activeTab) {
                    onChange(matchedIndex);
                }
            }
        } catch {
            // Safe fallback if URL search parsing fails
        }
    }, [syncWithUrl, urlParamName, tabs]);

    // Handle tab selection with optional shallow URL update
    const handleTabChange = useCallback((_e: React.SyntheticEvent, newIndex: number) => {
        onChange(newIndex);

        if (syncWithUrl && typeof window !== 'undefined') {
            try {
                const url = new URL(window.location.href);
                const tabKey = tabs[newIndex]?.key || String(newIndex);
                url.searchParams.set(urlParamName, tabKey);
                window.history.replaceState(null, '', url.toString());
            } catch {
                // Safe fallback
            }
        }
    }, [onChange, syncWithUrl, urlParamName, tabs]);

    return (
        <Paper
            elevation={0}
            sx={{
                borderRadius: '16px',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(226, 232, 240, 0.8)',
                bgcolor: 'background.paper',
                boxShadow: isDark
                    ? '0 4px 20px rgba(0, 0, 0, 0.25)'
                    : '0 1px 3px rgba(15, 23, 42, 0.03), 0 4px 12px -2px rgba(15, 23, 42, 0.03)',
                overflow: 'hidden',
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column'
            }}
        >
            {/* Sleek Segmented Pill Navigation Bar */}
            <Box
                sx={{
                    border: 'none !important',
                    borderBottom: 'none !important',
                    borderBlockEnd: 'none !important',
                    boxShadow: 'none !important',
                    px: { xs: 1.5, sm: 2 },
                    pt: 1.25,
                    pb: 0.75,
                    bgcolor: 'transparent',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    minWidth: 0,
                }}
            >
                <Box
                    sx={{
                        bgcolor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#e2e8f0',
                        p: '3.5px',
                        borderRadius: '10px',
                        display: 'inline-flex',
                        maxWidth: '100%',
                        border: '1px solid',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(203, 213, 225, 0.9)',
                    }}
                >
                    <Tabs
                        value={activeTab}
                        onChange={handleTabChange}
                        variant="scrollable"
                        scrollButtons="auto"
                        allowScrollButtonsMobile
                        sx={{
                            minHeight: 34,
                            border: 'none !important',
                            borderBottom: 'none !important',
                            borderBlockEnd: 'none !important',
                            '& .MuiTabs-indicator': {
                                display: 'none',
                            },
                            '& .MuiTabs-flexContainer': {
                                gap: '3px',
                            },
                            '& .MuiTab-root': {
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.8rem',
                                letterSpacing: '-0.01em',
                                minHeight: 32,
                                py: 0.4,
                                px: { xs: 1.1, sm: 1.35 },
                                borderRadius: '7px',
                                color: isDark ? 'rgba(255, 255, 255, 0.7)' : '#475569',
                                transition: 'all 0.16s ease-in-out',
                                '&:hover': {
                                    color: isDark ? '#ffffff' : '#0f172a',
                                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.75)',
                                },
                                '&.Mui-selected': {
                                    color: '#ffffff !important',
                                    backgroundColor: 'var(--mui-palette-primary-main, #666CFF) !important',
                                    boxShadow: isDark
                                        ? '0 2px 10px rgba(0, 0, 0, 0.5)'
                                        : '0 2px 8px rgba(102, 108, 255, 0.4)',
                                    fontWeight: 750,
                                    border: '1px solid',
                                    borderColor: 'rgba(255, 255, 255, 0.25)',
                                    '& .MuiTab-iconWrapper': {
                                        color: '#ffffff !important',
                                        opacity: 1,
                                    },
                                    '& svg': {
                                        color: '#ffffff !important',
                                    },
                                    '& span': {
                                        color: '#ffffff !important',
                                    }
                                },
                                '& .MuiTab-iconWrapper': {
                                    mr: 0.65,
                                    mb: '0 !important',
                                    fontSize: 16,
                                    color: 'inherit',
                                    opacity: 0.85,
                                }
                            },
                            '& .MuiTabScrollButton-root': {
                                width: 24,
                                height: 24,
                                my: 'auto',
                                mx: 0.2,
                                borderRadius: '6px',
                                color: isDark ? 'rgba(255, 255, 255, 0.6)' : '#64748b',
                                bgcolor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.9)',
                                border: '1px solid',
                                borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(203, 213, 225, 0.8)',
                                transition: 'all 0.15s ease',
                                '&:hover': {
                                    bgcolor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#ffffff',
                                    color: 'primary.main',
                                },
                                '&.Mui-disabled': {
                                    opacity: 0.15,
                                    pointerEvents: 'none',
                                }
                            }
                        }}
                    >
                        {tabs.map((tab, idx) => {
                            const isSelected = activeTab === idx;
                            const hasCount = tab.count !== undefined && tab.count !== null;
                            const hasBadge = !!tab.badgeLabel;

                            const getBadgeColors = (color?: string) => {
                                switch (color) {
                                    case 'success':
                                        return {
                                            bg: isDark ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.1)',
                                            color: isDark ? '#34d399' : '#059669',
                                            border: isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.25)',
                                            dot: '#10b981',
                                        };
                                    case 'warning':
                                        return {
                                            bg: isDark ? 'rgba(245, 158, 11, 0.16)' : 'rgba(245, 158, 11, 0.1)',
                                            color: isDark ? '#fbbf24' : '#d97706',
                                            border: isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.25)',
                                            dot: '#f59e0b',
                                        };
                                    case 'error':
                                        return {
                                            bg: isDark ? 'rgba(239, 68, 68, 0.16)' : 'rgba(239, 68, 68, 0.1)',
                                            color: isDark ? '#f87171' : '#dc2626',
                                            border: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.25)',
                                            dot: '#ef4444',
                                        };
                                    case 'primary':
                                    case 'info':
                                        return {
                                            bg: isDark ? 'rgba(37, 99, 235, 0.18)' : 'rgba(37, 99, 235, 0.09)',
                                            color: isDark ? '#60a5fa' : '#2563eb',
                                            border: isDark ? 'rgba(37, 99, 235, 0.3)' : 'rgba(37, 99, 235, 0.22)',
                                            dot: '#2563eb',
                                        };
                                    default:
                                        return {
                                            bg: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)',
                                            color: isDark ? 'rgba(255, 255, 255, 0.7)' : '#64748b',
                                            border: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(226, 232, 240, 0.8)',
                                            dot: '#64748b',
                                        };
                                }
                            };

                            const badgeColors = getBadgeColors(tab.badgeColor);

                            return (
                                <Tab
                                    key={idx}
                                    icon={tab.icon}
                                    iconPosition="start"
                                    sx={{
                                        ...(isSelected && {
                                            color: '#ffffff !important',
                                            backgroundColor: 'var(--mui-palette-primary-main, #666CFF) !important',
                                            boxShadow: isDark
                                                ? '0 2px 10px rgba(0, 0, 0, 0.5)'
                                                : '0 2px 8px rgba(102, 108, 255, 0.4)',
                                            fontWeight: 750,
                                            border: '1px solid rgba(255, 255, 255, 0.25)',
                                            '& .MuiTab-iconWrapper': {
                                                color: '#ffffff !important',
                                                opacity: 1,
                                            },
                                            '& svg': {
                                                color: '#ffffff !important',
                                            },
                                            '& span': {
                                                color: '#ffffff !important',
                                            }
                                        })
                                    }}
                                    label={
                                        <Stack direction="row" spacing={0.8} sx={{ alignItems: 'center' }}>
                                            <span style={{ color: isSelected ? '#ffffff' : undefined, fontWeight: isSelected ? 750 : 600 }}>{tab.label}</span>
                                            {hasCount && (
                                                <Box
                                                    component="span"
                                                    sx={{
                                                        px: 0.7,
                                                        py: 0.1,
                                                        borderRadius: '5px',
                                                        fontSize: '0.675rem',
                                                        fontWeight: 750,
                                                        lineHeight: 1.3,
                                                        bgcolor: isSelected
                                                            ? 'rgba(255, 255, 255, 0.25)'
                                                            : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)'),
                                                        color: isSelected ? '#ffffff' : (isDark ? 'rgba(255, 255, 255, 0.8)' : '#475569'),
                                                        border: isSelected
                                                            ? '1px solid rgba(255, 255, 255, 0.35)'
                                                            : (isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(203, 213, 225, 0.8)'),
                                                        transition: 'all 0.18s ease',
                                                    }}
                                                >
                                                    {typeof tab.count === 'number' ? tab.count.toLocaleString() : tab.count}
                                                </Box>
                                            )}
                                            {hasBadge && (
                                                <Box
                                                    component="span"
                                                    sx={{
                                                        px: 0.75,
                                                        py: 0.15,
                                                        borderRadius: '5px',
                                                        fontSize: '0.675rem',
                                                        fontWeight: 750,
                                                        lineHeight: 1.3,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 0.5,
                                                        bgcolor: isSelected
                                                            ? 'rgba(255, 255, 255, 0.22)'
                                                            : badgeColors.bg,
                                                        color: isSelected ? '#ffffff' : badgeColors.color,
                                                        border: isSelected
                                                            ? '1px solid rgba(255, 255, 255, 0.35)'
                                                            : `1px solid ${badgeColors.border}`,
                                                    }}
                                                >
                                                    <Box
                                                        component="span"
                                                        sx={{
                                                            width: 5,
                                                            height: 5,
                                                            borderRadius: '50%',
                                                            bgcolor: isSelected ? '#ffffff' : badgeColors.dot,
                                                            flexShrink: 0
                                                        }}
                                                    />
                                                    {tab.badgeLabel}
                                                </Box>
                                            )}
                                        </Stack>
                                    }
                                />
                            );
                        })}
                    </Tabs>
                </Box>
            </Box>

            {/* Tab Body Content (Scrollable) */}
            <Box
                sx={{
                    border: 'none !important',
                    borderTop: 'none !important',
                    borderBlockStart: 'none !important',
                    p: { xs: 2, md: 3 },
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    '&::-webkit-scrollbar': { width: '6px' },
                    '&::-webkit-scrollbar-thumb': {
                        bgcolor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
                        borderRadius: '6px'
                    }
                }}
            >
                {children}
            </Box>
        </Paper>
    );
};

export const DetailTabPanel: React.FC<{ value: number; index: number; children: React.ReactNode }> = ({
    value,
    index,
    children
}) => {
    if (value !== index) return null;
    return <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</Box>;
};
