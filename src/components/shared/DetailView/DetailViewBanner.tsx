'use client';
/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
 

import React from 'react';
import {
    Box,
    Paper,
    Typography,
    Button,
    Stack,
    Chip,
    useTheme
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

export interface DetailViewBannerProps {
    onBack?: () => void;
    backLabel?: string;
    showBack?: boolean;
    title?: string;
    subtitle?: string;
    badge?: React.ReactNode;
    actions?: React.ReactNode;
    children?: React.ReactNode;
}

export const glassActionButtonSx = {
    borderRadius: '8px',
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '0.84rem',
    py: 0.75,
    px: 2,
    bgcolor: 'rgba(255, 255, 255, 0.1)',
    color: '#ffffff !important',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    backdropFilter: 'blur(8px)',
    transition: 'all 0.2s ease',
    '&:hover': {
        bgcolor: 'rgba(255, 255, 255, 0.18)',
        borderColor: 'rgba(255, 255, 255, 0.32)',
        transform: 'translateY(-1px)'
    }
};

export const glassSuccessButtonSx = {
    borderRadius: '8px',
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '0.84rem',
    py: 0.75,
    px: 2,
    bgcolor: 'rgba(16, 185, 129, 0.18)',
    color: '#6ee7b7 !important',
    border: '1px solid rgba(16, 185, 129, 0.35)',
    backdropFilter: 'blur(8px)',
    transition: 'all 0.2s ease',
    '&:hover': {
        bgcolor: 'rgba(16, 185, 129, 0.28)',
        borderColor: 'rgba(16, 185, 129, 0.5)',
        transform: 'translateY(-1px)'
    }
};

export const glassPurpleButtonSx = {
    borderRadius: '8px',
    textTransform: 'none',
    fontWeight: 700,
    fontSize: '0.84rem',
    py: 0.75,
    px: 2,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    color: '#d8b4fe !important',
    bgcolor: 'rgba(168, 85, 247, 0.16)',
    border: '1px solid rgba(168, 85, 247, 0.35)',
    backdropFilter: 'blur(8px)',
    transition: 'all 0.2s ease',
    '&:hover': {
        bgcolor: 'rgba(168, 85, 247, 0.26)',
        borderColor: 'rgba(168, 85, 247, 0.5)',
        transform: 'translateY(-1px)'
    }
};

export const DetailViewBanner: React.FC<DetailViewBannerProps> = ({
    onBack,
    backLabel = 'Back to List',
    showBack = false,
    title,
    subtitle,
    badge,
    actions,
    children
}) => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    return (
        <Paper
            elevation={0}
            sx={{
                mb: 2.5,
                px: { xs: 2.5, sm: 3 },
                py: 1.75,
                minHeight: 64,
                borderRadius: '14px',
                background: isDark
                    ? 'linear-gradient(90deg, #0f172a 0%, #1e293b 50%, #334155 100%)'
                    : 'linear-gradient(90deg, #1e293b 0%, #334155 60%, #475569 100%)',
                color: '#ffffff',
                border: '1px solid',
                borderColor: 'rgba(255, 255, 255, 0.15)',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.16)',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5
            }}
        >
            {/* Ambient Neutral Glow Overlay */}
            <Box
                sx={{
                    position: 'absolute',
                    inset: 0,
                    background: 'radial-gradient(circle at 10% 50%, rgba(255, 255, 255, 0.08) 0%, transparent 50%), radial-gradient(circle at 90% 50%, rgba(255, 255, 255, 0.06) 0%, transparent 50%)',
                    pointerEvents: 'none'
                }}
            />

            {/* Left Info Section */}
            <Stack
                direction="row"
                spacing={1.5}
                sx={{ alignItems: 'center', position: 'relative', zIndex: 1, minWidth: 0, flexWrap: 'wrap', gap: 1 }}
            >
                {showBack && onBack && (
                    <Button
                        variant="text"
                        startIcon={<ArrowBackIcon fontSize="small" />}
                        onClick={onBack}
                        sx={{
                            textTransform: 'none',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            color: '#ffffff !important',
                            bgcolor: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.16)',
                            px: 2,
                            py: 0.75,
                            borderRadius: '8px',
                            backdropFilter: 'blur(8px)',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                bgcolor: 'rgba(255, 255, 255, 0.18)',
                                borderColor: 'rgba(255, 255, 255, 0.35)',
                                transform: 'translateX(-2px)'
                            }
                        }}
                    >
                        {backLabel}
                    </Button>
                )}

                {title && (
                    <Typography
                        variant="h6"
                        sx={{
                            fontWeight: 800,
                            fontSize: { xs: '1.05rem', sm: '1.15rem' },
                            color: '#ffffff !important',
                            letterSpacing: '-0.2px',
                            maxWidth: { xs: 200, sm: 320, md: 500 },
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {title}
                    </Typography>
                )}

                {subtitle && (
                    <Chip
                        label={subtitle}
                        size="small"
                        sx={{
                            display: { xs: 'none', sm: 'inline-flex' },
                            height: 26,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            bgcolor: 'rgba(255, 255, 255, 0.12)',
                            color: 'rgba(255, 255, 255, 0.95)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            backdropFilter: 'blur(6px)'
                        }}
                    />
                )}

                {badge}
            </Stack>

            {/* Right Action Controls */}
            {(actions || children) && (
                <Stack
                    direction="row"
                    spacing={1.25}
                    sx={{ alignItems: 'center', position: 'relative', zIndex: 1, ml: 'auto', flexWrap: 'wrap', gap: 1 }}
                >
                    {actions}
                    {children}
                </Stack>
            )}
        </Paper>
    );
};

export default DetailViewBanner;

