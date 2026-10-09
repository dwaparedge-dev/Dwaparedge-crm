'use client';
/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
 

import React from 'react';
import { Box, Paper, Typography, useTheme } from '@mui/material';

export interface DetailViewMetric {
    label: string;
    value: React.ReactNode;
    subtitle?: string;
    color?: string;
    icon?: React.ReactNode;
}

export interface DetailViewMetricStripProps {
    metrics: DetailViewMetric[];
    columns?: 2 | 3 | 4 | 5 | 6;
}

export const DetailViewMetricStrip: React.FC<DetailViewMetricStripProps> = ({
    metrics,
    columns = 4
}) => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const colCount = Math.min(metrics.length, columns);

    return (
        <Paper
            elevation={0}
            sx={{
                mb: 2.5,
                borderRadius: '14px',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(148, 163, 184, 0.35)',
                background: isDark
                    ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.85) 100%)'
                    : 'linear-gradient(135deg, rgba(241, 245, 249, 0.94) 0%, rgba(226, 232, 240, 0.88) 50%, rgba(203, 213, 225, 0.76) 100%)',
                backdropFilter: 'blur(16px)',
                boxShadow: isDark
                    ? '0 6px 24px rgba(0, 0, 0, 0.3)'
                    : '0 4px 20px -2px rgba(15, 23, 42, 0.06), 0 2px 6px -1px rgba(15, 23, 42, 0.04)',
                overflow: 'hidden'
            }}
        >
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                        xs: 'repeat(2, 1fr)',
                        sm: colCount >= 4 ? `repeat(${colCount}, 1fr)` : `repeat(${colCount}, 1fr)`
                    },
                    '& > div': {
                        py: { xs: 1.25, sm: 2.75 },
                        px: { xs: 1.5, sm: colCount >= 5 ? 2.25 : 2.75 },
                        borderRight: { sm: '1px solid' },
                        borderBottom: { xs: '1px solid', sm: 'none' },
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(148, 163, 184, 0.3)',
                        '&:nth-of-type(2n)': {
                            borderRight: { xs: 'none', sm: '1px solid' }
                        },
                        '&:last-child': {
                            borderRight: 'none',
                            borderBottom: 'none'
                        },
                        minWidth: 0
                    }
                }}
            >
                {metrics.map((metric, idx) => {
                    const valueColor = metric.color || (isDark ? '#e2e8f0' : '#334155');
                    return (
                        <Box key={idx} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: { xs: 0.25, sm: 0.75 } }}>
                                <Typography
                                    variant="caption"
                                    noWrap
                                    sx={{
                                        fontWeight: 800,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        fontSize: { xs: '0.66rem', sm: '0.74rem' },
                                        color: isDark ? '#f8fafc' : '#0f172a'
                                    }}
                                >
                                    {metric.label}
                                </Typography>
                                {metric.icon && (
                                    <Box sx={{ color: isDark ? 'rgba(255, 255, 255, 0.45)' : '#64748b', display: 'flex', alignItems: 'center', ml: 0.5, '& svg': { fontSize: { xs: 16, sm: 20 } } }}>
                                        {metric.icon}
                                    </Box>
                                )}
                            </Box>
                            <Typography
                                noWrap
                                sx={{
                                    fontSize: { xs: '1.05rem', sm: colCount >= 5 ? '1.25rem' : '1.4rem' },
                                    fontWeight: 800,
                                    color: valueColor,
                                    letterSpacing: '-0.3px',
                                    lineHeight: 1.25,
                                    my: { xs: 0.15, sm: 0.4 }
                                }}
                            >
                                {metric.value ?? '—'}
                            </Typography>
                            {metric.subtitle && (
                                <Typography
                                    variant="caption"
                                    noWrap
                                    sx={{
                                        fontSize: { xs: '0.65rem', sm: '0.72rem' },
                                        fontWeight: 500,
                                        color: isDark ? 'rgba(255, 255, 255, 0.6)' : '#64748b',
                                        display: 'block',
                                        mt: { xs: 0.1, sm: 0.25 }
                                    }}
                                >
                                    {metric.subtitle}
                                </Typography>
                            )}
                        </Box>
                    );
                })}
            </Box>
        </Paper>
    );
};
