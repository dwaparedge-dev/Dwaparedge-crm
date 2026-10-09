'use client';

/**
 * ChartSkeleton
 * Mimics ApexCharts within ChartCard or ReportChart containers across FactoONE.
 * Supports: 'bar', 'line', 'area', 'pie', 'donut', 'gauge'.
 */

import React from 'react';
import { Box, Card, Skeleton, useTheme, alpha } from '@mui/material';

export interface ChartSkeletonProps {
    /** Chart container height in px (default 300) */
    height?: number;
    /** Chart type variant */
    variant?: 'bar' | 'pie' | 'donut' | 'line' | 'area' | 'gauge';
    /** Whether to render the ChartCard title and action header (default false) */
    showHeader?: boolean;
}

export const ChartSkeleton: React.FC<ChartSkeletonProps> = ({
    height = 300,
    variant = 'bar',
    showHeader = false,
}) => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const renderChartBody = () => {
        // ── 1. Pie & Donut Chart Skeleton ──────────────────────────────────────────
        if (variant === 'pie' || variant === 'donut') {
            const circleSize = Math.min(height - 80, 200);

            return (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', py: 2 }}>
                    {variant === 'donut' ? (
                        <Box sx={{ position: 'relative', width: circleSize, height: circleSize, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Skeleton variant="circular" width={circleSize} height={circleSize} animation="wave" />
                            <Box
                                sx={{
                                    position: 'absolute',
                                    width: circleSize * 0.55,
                                    height: circleSize * 0.55,
                                    borderRadius: '50%',
                                    bgcolor: isDark ? theme.palette.background.paper : '#ffffff',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <Skeleton variant="text" width="50%" height={18} animation="wave" />
                                <Skeleton variant="text" width="70%" height={26} animation="wave" />
                            </Box>
                        </Box>
                    ) : (
                        <Skeleton variant="circular" width={circleSize} height={circleSize} animation="wave" />
                    )}

                    {/* Legend Placeholders */}
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center', mt: 3 }}>
                        {[80, 60, 100, 70].map((w, i) => (
                            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <Skeleton variant="rounded" width={12} height={12} animation="wave" sx={{ borderRadius: 0.5 }} />
                                <Skeleton variant="text" width={w} height={16} animation="wave" />
                            </Box>
                        ))}
                    </Box>
                </Box>
            );
        }

        // ── 2. Line & Area Chart Skeleton ──────────────────────────────────────────
        if (variant === 'line' || variant === 'area') {
            return (
                <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
                    <Box sx={{ display: 'flex', flex: 1, gap: 1.5, minHeight: 0 }}>
                        {/* Y-axis labels */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pb: 3 }}>
                            {[...Array(4)].map((_, i) => (
                                <Skeleton key={i} variant="text" width={32} height={14} animation="wave" />
                            ))}
                        </Box>

                        {/* Line / Area Wave Curve Simulation */}
                        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', pb: 3, position: 'relative' }}>
                            {/* Horizontal Grid lines */}
                            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none' }}>
                                {[...Array(4)].map((_, i) => (
                                    <Box key={i} sx={{ width: '100%', height: 1, bgcolor: alpha(theme.palette.divider, 0.4) }} />
                                ))}
                            </Box>

                            {/* Simulated Wave Curve SVG */}
                            <Box
                                sx={{
                                    width: '100%',
                                    height: '70%',
                                    opacity: isDark ? 0.35 : 0.25,
                                    display: 'flex',
                                    alignItems: 'flex-end',
                                }}
                            >
                                <svg width="100%" height="100%" viewBox="0 0 500 150" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                                    <path
                                        d="M 0 120 Q 70 30 140 80 T 280 40 T 420 90 T 500 20 L 500 150 L 0 150 Z"
                                        fill={alpha(theme.palette.primary.main, 0.2)}
                                    />
                                    <path
                                        d="M 0 120 Q 70 30 140 80 T 280 40 T 420 90 T 500 20"
                                        fill="none"
                                        stroke={theme.palette.primary.main}
                                        strokeWidth="3"
                                        strokeDasharray="6 4"
                                    />
                                </svg>
                            </Box>
                        </Box>
                    </Box>

                    {/* X-axis labels */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 5, pr: 1 }}>
                        {[...Array(6)].map((_, i) => (
                            <Skeleton key={i} variant="text" width={40} height={14} animation="wave" />
                        ))}
                    </Box>
                </Box>
            );
        }

        // ── 3. Bar Chart Skeleton (Default) ─────────────────────────────────────────
        return (
            <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
                <Box sx={{ display: 'flex', flex: 1, gap: 1.5, minHeight: 0 }}>
                    {/* Y-axis labels */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pb: 3 }}>
                        {[...Array(5)].map((_, i) => (
                            <Skeleton key={i} variant="text" width={32} height={14} animation="wave" />
                        ))}
                    </Box>

                    {/* Vertical Bar Columns */}
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 1.5, pb: 3, pr: 1 }}>
                        {[65, 85, 45, 95, 70, 80, 55, 75].map((h, i) => (
                            <Skeleton
                                key={i}
                                variant="rounded"
                                width="100%"
                                height={`${h}%`}
                                animation="wave"
                                sx={{ borderRadius: '6px 6px 0 0', flexShrink: 0 }}
                            />
                        ))}
                    </Box>
                </Box>

                {/* X-axis labels */}
                <Box sx={{ display: 'flex', gap: 1.5, pl: 5, pr: 1 }}>
                    {[...Array(8)].map((_, i) => (
                        <Skeleton key={i} variant="text" width="100%" height={14} animation="wave" />
                    ))}
                </Box>
            </Box>
        );
    };

    if (showHeader) {
        return (
            <Card
                sx={{
                    p: 2.5,
                    borderRadius: '16px',
                    height,
                    display: 'flex',
                    flexDirection: 'column',
                    border: isDark
                        ? `1px solid ${alpha(theme.palette.divider, 0.15)}`
                        : '1px solid rgba(226, 232, 240, 0.9)',
                    bgcolor: isDark ? alpha(theme.palette.background.paper, 0.6) : '#ffffff',
                    boxShadow: isDark
                        ? '0 2px 8px rgba(0,0,0,0.3)'
                        : '0 2px 8px rgba(0,0,0,0.06)',
                }}
            >
                {/* Header (Title + Action) */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box>
                        <Skeleton variant="text" width={160} height={24} animation="wave" />
                        <Skeleton variant="text" width={220} height={16} animation="wave" />
                    </Box>
                    <Skeleton variant="rounded" width={80} height={28} animation="wave" sx={{ borderRadius: '6px' }} />
                </Box>

                {/* Chart Area */}
                <Box sx={{ flex: 1, minHeight: 0 }}>
                    {renderChartBody()}
                </Box>
            </Card>
        );
    }

    return (
        <Box sx={{ width: '100%', height }}>
            {renderChartBody()}
        </Box>
    );
};

export default ChartSkeleton;
