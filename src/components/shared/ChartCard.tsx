import React from 'react';
import { Card, useTheme, alpha, SxProps, Theme, Typography, Box } from '@mui/material';

interface ChartCardProps {
    children: React.ReactNode;
    title?: string;
    subtitle?: string;
    action?: React.ReactNode;
    height?: number | string;
    sx?: SxProps<Theme>;
    /** Show a drag handle dot indicator at the top of the card */
    draggable?: boolean;
    noPadding?: boolean;
}

const ChartCard: React.FC<ChartCardProps> = ({
    children,
    title,
    subtitle,
    action,
    height = '100%',
    sx,
    draggable = false,
    noPadding = false,
}) => {
    const theme = useTheme();

    return (
        <Card sx={{
            background: theme.palette.mode === 'dark'
                ? alpha(theme.palette.background.paper, 0.6)
                : '#FFFFFF',
            height: height,
            display: 'flex',
            flexDirection: 'column',
            p: 0,
            borderRadius: '16px',
            boxShadow: theme.palette.mode === 'dark'
                ? '0 2px 8px rgba(0,0,0,0.3)'
                : '0 2px 8px rgba(0,0,0,0.06)',
            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            overflow: 'hidden',
            position: 'relative',
            '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: theme.palette.mode === 'dark'
                    ? '0 6px 20px rgba(0,0,0,0.4)'
                    : '0 6px 20px rgba(0,0,0,0.1)',
            },
            '&:hover .drag-handle': {
                opacity: 1,
            },
            ...sx
        }}>
            {/* Drag Handle (only shown on hover) */}
            {draggable && (
                <Box
                    className="drag-handle"
                    sx={{
                        position: 'absolute',
                        top: 8,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: '3px',
                        p: '5px 10px',
                        borderRadius: '10px',
                        bgcolor: alpha(theme.palette.divider, 0.12),
                        cursor: 'grab',
                        zIndex: 5,
                        opacity: 0,
                        transition: 'opacity 0.2s ease, background-color 0.2s ease',
                        '&:hover': {
                            bgcolor: alpha(theme.palette.primary.main, 0.15),
                        },
                        '&:active': { cursor: 'grabbing' }
                    }}
                >
                    {[...Array(3)].map((_, i) => (
                        <Box key={i} sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.secondary' }} />
                    ))}
                </Box>
            )}

            {/* Optional Header */}
            {(title || action) && (
                <Box sx={{
                    px: 2.5,
                    pt: draggable ? 3.5 : 2.5,
                    pb: 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexShrink: 0,
                }}>
                    <Box>
                        {title && (
                            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1.3 }}>
                                {title}
                            </Typography>
                        )}
                        {subtitle && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontSize: '0.8rem' }}>
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                    {action && <Box>{action}</Box>}
                </Box>
            )}

            {/* Content */}
            <Box sx={{
                flexGrow: 1,
                position: 'relative',
                overflow: 'hidden',
                p: noPadding ? 0 : (title ? 2 : 0),
                pt: noPadding ? 0 : (draggable && !title ? 3 : undefined),
            }}>
                {children}
            </Box>
        </Card>
    );
};

export default ChartCard;
