'use client';
/* eslint-disable @typescript-eslint/no-unused-vars */
/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
 

import React from 'react';
import {
    Box,
    Paper,
    Typography,
    Button,
    Stack,
    Tooltip,
    IconButton,
    Divider,
    Avatar,
    useTheme,
    Collapse
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useNotify } from '@/components/common/Notify';

export interface DetailViewAttribute {
    label: string;
    value: React.ReactNode;
    isMonospace?: boolean;
    highlight?: boolean;
}

export interface DetailViewHeroSidebarProps {
    onBack?: () => void;
    backLabel?: string;
    showBack?: boolean;
    title: string;
    titleLabel?: string;
    subtitle?: string;
    subtitleLabel?: string;
    copyValue?: string;
    avatarUrl?: string;
    avatarIcon?: React.ReactNode;
    onAvatarClick?: () => void;
    badges?: React.ReactNode;
    attributes: DetailViewAttribute[];
    onEdit?: () => void;
    onDelete?: () => void;
    editLabel?: string;
    deleteLabel?: string;
    editPermissionSlug?: string | string[];
    deletePermissionSlug?: string | string[];
    actions?: React.ReactNode;
    children?: React.ReactNode;
    compact?: boolean;
}

export const DetailViewHeroSidebar: React.FC<DetailViewHeroSidebarProps> = ({
    onBack,
    backLabel = 'Back to List',
    showBack = true,
    title,
    titleLabel,
    subtitle,
    subtitleLabel,
    copyValue,
    avatarUrl,
    avatarIcon,
    onAvatarClick,
    badges,
    attributes,
    onEdit,
    onDelete,
    editLabel = 'Edit',
    deleteLabel = 'Delete',
    editPermissionSlug,
    deletePermissionSlug,
    actions,
    children,
    compact = false
}) => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const notify = useNotify();
    const showMessage = (msg: string, type: 'success' | 'error') => (type === 'success' ? notify.success(msg) : notify.error(msg));
    const [mobileAttributesOpen, setMobileAttributesOpen] = React.useState(false);

    const handleCopy = () => {
        const textToCopy = copyValue || subtitle || title;
        if (textToCopy && typeof textToCopy === 'string') {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(textToCopy)
                    .then(() => {
                        showMessage(`${titleLabel || 'Identifier'} copied to clipboard`, 'success');
                    })
                    .catch(() => {
                        showMessage('Failed to copy to clipboard', 'error');
                    });
            }
        }
    };

    return (
        <Paper
            elevation={0}
            sx={{
                p: { xs: 2, md: compact ? 1.75 : 2.5 },
                width: '100%',
                height: '100%',
                minHeight: { md: 'calc(100vh - 165px)' },
                maxHeight: { md: 'calc(100vh - 165px)' },
                position: { xs: 'relative', md: 'sticky' },
                top: { md: 16 },
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '16px',
                background: isDark
                    ? 'linear-gradient(180deg, #0f172a 0%, #1e293b 50%, #334155 100%)'
                    : 'linear-gradient(180deg, #1e293b 0%, #334155 60%, #475569 100%)',
                color: '#ffffff',
                border: '1px solid',
                borderColor: 'rgba(255, 255, 255, 0.15)',
                boxShadow: '0 10px 30px rgba(15, 23, 42, 0.22)',
                overflow: 'hidden'
            }}
        >
            {/* Ambient Neutral Glow Overlay */}
            <Box
                sx={{
                    position: 'absolute',
                    inset: 0,
                    background: 'radial-gradient(circle at 80% 10%, rgba(255, 255, 255, 0.12) 0%, transparent 60%)',
                    pointerEvents: 'none'
                }}
            />

            {/* Top Fixed Header Info */}
            <Box sx={{ position: 'relative', zIndex: 1, flexShrink: 0 }}>
                {/* Optional Top Integrated Back Button (when not using DetailViewBanner) */}
                {showBack && onBack && (
                    <Button
                        variant="text"
                        startIcon={<ArrowBackIcon fontSize="small" />}
                        onClick={onBack}
                        sx={{
                            textTransform: 'none',
                            fontWeight: 700,
                            color: 'rgba(255,255,255,0.85) !important',
                            px: 1,
                            py: 0.5,
                            mb: compact ? 1 : 2,
                            borderRadius: '8px',
                            '&:hover': { color: '#ffffff !important', bgcolor: 'rgba(255,255,255,0.12)' }
                        }}
                    >
                        {backLabel}
                    </Button>
                )}

                {/* Avatar and Primary Entity Name Row */}
                <Box sx={{ mb: compact ? 1.25 : 2, display: 'flex', alignItems: 'center', gap: compact ? 1.25 : 1.75 }}>
                    {(avatarUrl || avatarIcon) && (
                        <Box sx={{ position: 'relative', flexShrink: 0 }}>
                            <Avatar
                                src={avatarUrl}
                                sx={{
                                    width: compact ? 38 : 60,
                                    height: compact ? 38 : 60,
                                    bgcolor: 'rgba(255, 255, 255, 0.12)',
                                    color: '#ffffff',
                                    border: '2px solid rgba(255, 255, 255, 0.25)',
                                    cursor: onAvatarClick ? 'pointer' : 'default',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                                    '&:hover': onAvatarClick ? { opacity: 0.85 } : {}
                                }}
                                onClick={onAvatarClick}
                            >
                                {avatarIcon && React.isValidElement(avatarIcon)
                                    ? React.cloneElement(avatarIcon as React.ReactElement<{ sx?: Record<string, unknown> }>, {
                                          sx: {
                                              fontSize: compact ? 22 : 32,
                                              ...((avatarIcon as React.ReactElement<{ sx?: Record<string, unknown> }>).props?.sx || {})
                                          }
                                      })
                                    : avatarIcon}
                            </Avatar>
                            {avatarUrl && onAvatarClick && (
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        bottom: -2,
                                        right: -2,
                                        bgcolor: 'rgba(15, 23, 42, 0.8)',
                                        borderRadius: '50%',
                                        p: 0.25,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        border: '1px solid rgba(255,255,255,0.3)'
                                    }}
                                >
                                    <ZoomInIcon sx={{ fontSize: 13, color: '#fff' }} />
                                </Box>
                            )}
                        </Box>
                    )}

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                            variant="h6"
                            sx={{
                                color: '#ffffff !important',
                                fontWeight: 900,
                                fontSize: compact ? '1.05rem' : '1.2rem',
                                lineHeight: 1.25,
                                letterSpacing: '-0.2px',
                                wordBreak: 'break-word'
                            }}
                        >
                            {title}
                        </Typography>
                    </Box>
                </Box>

                {/* Category / Subtitle / Role Header */}
                {subtitle && (
                    <Box sx={{ mb: compact ? 1.25 : 2 }}>
                        <Typography
                            variant="caption"
                            sx={{
                                color: 'rgba(255,255,255,0.55) !important',
                                fontWeight: 700,
                                letterSpacing: '0.6px',
                                textTransform: 'uppercase',
                                fontSize: compact ? '0.62rem' : '0.72rem',
                                display: 'block'
                            }}
                        >
                            {subtitleLabel || titleLabel || 'Category'}
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 0.25, alignItems: 'center' }}>
                            <Typography
                                sx={{
                                    fontSize: compact ? '0.92rem' : '1.05rem',
                                    fontWeight: 700,
                                    color: 'rgba(255, 255, 255, 0.95) !important',
                                    letterSpacing: '-0.2px',
                                    wordBreak: 'break-word',
                                    fontFamily: (copyValue && copyValue === subtitle) ? 'monospace' : 'inherit'
                                }}
                            >
                                {subtitle}
                            </Typography>
                            {copyValue && copyValue === subtitle && (
                                <Tooltip title={`Copy ${subtitleLabel || 'Code'}`}>
                                    <IconButton
                                        size="small"
                                        onClick={handleCopy}
                                        sx={{
                                            color: 'rgba(255,255,255,0.6)',
                                            p: 0.5,
                                            '&:hover': { color: '#ffffff', bgcolor: 'rgba(255,255,255,0.12)' }
                                        }}
                                    >
                                        <ContentCopyIcon sx={{ fontSize: 15 }} />
                                    </IconButton>
                                </Tooltip>
                            )}
                        </Stack>
                    </Box>
                )}

                {/* Badges Bar */}
                {badges && (
                    <Stack direction="row" spacing={1} sx={{ mb: compact ? 1.25 : 2, flexWrap: 'wrap', gap: 0.75 }}>
                        {badges}
                    </Stack>
                )}

                <Divider sx={{ mb: compact ? 1 : 1.5, borderColor: 'rgba(255,255,255,0.12)' }} />

                {/* Mobile Actions Row (Rendered only on xs/sm below header info) */}
                {(actions || onEdit || onDelete) && (
                    <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 1.5, position: 'relative', zIndex: 1 }}>
                        {actions ? (
                            <Stack spacing={1}>
                                {actions}
                            </Stack>
                        ) : (
                            <Stack direction="row" spacing={1} sx={{ width: '100%' }}>
                                {onEdit && (
                                    <Button
                                        variant="text"
                                        startIcon={<EditIcon fontSize="small" />}
                                        onClick={onEdit}
                                        sx={{
                                            flex: onDelete ? 0.65 : 1,
                                            minWidth: 0,
                                            borderRadius: '8px',
                                            textTransform: 'none',
                                            fontWeight: 700,
                                            fontSize: '0.82rem',
                                            py: 0.7,
                                            px: 1.25,
                                            minHeight: '38px',
                                            bgcolor: 'rgba(255, 255, 255, 0.1)',
                                            color: '#ffffff !important',
                                            border: '1px solid rgba(255, 255, 255, 0.18)',
                                            backdropFilter: 'blur(8px)',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {editLabel}
                                    </Button>
                                )}
                                {onDelete && (
                                    <Button
                                        variant="text"
                                        startIcon={<DeleteIcon fontSize="small" sx={{ color: '#ef4444 !important' }} />}
                                        onClick={onDelete}
                                        sx={{
                                            flex: onEdit ? 0.35 : 1,
                                            minWidth: 0,
                                            borderRadius: '8px',
                                            textTransform: 'none',
                                            fontWeight: 700,
                                            fontSize: '0.82rem',
                                            py: 0.7,
                                            px: 1.25,
                                            minHeight: '38px',
                                            bgcolor: 'rgba(255, 255, 255, 0.1)',
                                            color: '#ef4444 !important',
                                            border: '1px solid rgba(255, 255, 255, 0.18)',
                                            backdropFilter: 'blur(8px)',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {deleteLabel}
                                    </Button>
                                )}
                            </Stack>
                        )}
                    </Box>
                )}

                {/* Mobile Collapsible Attributes Trigger (Rendered only on xs/sm) */}
                {attributes && attributes.length > 0 && (
                    <Box sx={{ display: { xs: 'block', md: 'none' }, position: 'relative', zIndex: 1 }}>
                        <Button
                            size="small"
                            fullWidth
                            onClick={() => setMobileAttributesOpen((prev) => !prev)}
                            endIcon={
                                <KeyboardArrowDownIcon
                                    sx={{
                                        transform: mobileAttributesOpen ? 'rotate(180deg)' : 'none',
                                        transition: 'transform 0.2s ease',
                                        fontSize: '18px !important',
                                    }}
                                />
                            }
                            sx={{
                                textTransform: 'none',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                color: 'rgba(255, 255, 255, 0.85) !important',
                                bgcolor: 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '8px',
                                py: 0.6,
                                justifyContent: 'space-between',
                                px: 1.5,
                                '&:hover': {
                                    bgcolor: 'rgba(255, 255, 255, 0.12)',
                                },
                            }}
                        >
                            {mobileAttributesOpen ? 'Hide Entity Details' : `Show Details & Specs (${attributes.length})`}
                        </Button>

                        <Collapse in={mobileAttributesOpen} timeout="auto" unmountOnExit>
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                                    gap: 1,
                                    mt: 1.25,
                                }}
                            >
                                {attributes.map((attr, idx) => (
                                    <Box
                                        key={idx}
                                        sx={{
                                            p: '6px 8px',
                                            borderRadius: '7px',
                                            bgcolor: 'rgba(255, 255, 255, 0.05)',
                                            border: '1px solid rgba(255, 255, 255, 0.08)',
                                        }}
                                    >
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: 'rgba(255,255,255,0.55) !important',
                                                fontWeight: 700,
                                                letterSpacing: '0.4px',
                                                textTransform: 'uppercase',
                                                fontSize: '0.6rem',
                                                display: 'block',
                                                mb: 0.1,
                                            }}
                                        >
                                            {attr.label}
                                        </Typography>
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontWeight: 800,
                                                fontSize: '0.78rem',
                                                '& a': { color: 'inherit', fontWeight: 'inherit', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
                                                color: '#ffffff !important',
                                                fontFamily: attr.isMonospace ? 'monospace' : 'inherit',
                                            }}
                                            noWrap
                                        >
                                            {attr.value || 'N/A'}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                            {children && <Box sx={{ mt: 1.5 }}>{children}</Box>}
                        </Collapse>
                    </Box>
                )}
            </Box>

            {/* Middle Scrollable Attributes Area (Desktop md and up) */}
            <Box
                sx={{
                    display: { xs: 'none', md: 'flex' },
                    flex: 1,
                    minHeight: 0,
                    flexDirection: 'column',
                    overflowY: 'auto',
                    pr: 0.5,
                    position: 'relative',
                    zIndex: 1,
                    '&::-webkit-scrollbar': { width: '4px' },
                    '&::-webkit-scrollbar-thumb': {
                        bgcolor: 'rgba(255,255,255,0.18)',
                        borderRadius: '4px'
                    }
                }}
            >
                <Stack spacing={compact ? 0.75 : 1.25}>
                    {attributes.map((attr, idx) => (
                        <Box
                            key={idx}
                            sx={{
                                p: compact ? '6px 10px' : 1.5,
                                borderRadius: compact ? '7px' : '10px',
                                bgcolor: 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid rgba(255, 255, 255, 0.08)'
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    color: 'rgba(255,255,255,0.55) !important',
                                    fontWeight: 700,
                                    letterSpacing: '0.4px',
                                    textTransform: 'uppercase',
                                    fontSize: compact ? '0.6rem' : '0.68rem',
                                    display: 'block',
                                    mb: compact ? 0.1 : 0.25
                                }}
                            >
                                {attr.label}
                            </Typography>
                            <Tooltip title={typeof attr.value === 'string' || typeof attr.value === 'number' ? String(attr.value) : ''} placement="top-start" arrow>
                                <Typography
                                    variant="body2"
                                    sx={{
                                        fontWeight: 800,
                                        fontSize: compact ? '0.8rem' : '0.875rem',
                                        '& a': { color: 'inherit', fontWeight: 'inherit', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
                                        color: '#ffffff !important',
                                        fontFamily: attr.isMonospace ? 'monospace' : 'inherit',
                                        cursor: (typeof attr.value === 'string' && attr.value.length > 25) ? 'pointer' : 'default'
                                    }}
                                    noWrap
                                >
                                    {attr.value || 'N/A'}
                                </Typography>
                            </Tooltip>
                        </Box>
                    ))}
                </Stack>

                {/* Extra custom children */}
                {children && <Box sx={{ mt: 2 }}>{children}</Box>}
            </Box>

            {/* Bottom Action Controls (Desktop md and up) */}
            {(actions || onEdit || onDelete) && (
                <Box sx={{
                    display: { xs: 'none', md: 'block' },
                    mt: 'auto',
                    pt: compact ? 1.25 : 2,
                    borderTop: '1px solid rgba(255,255,255,0.12)',
                    position: 'relative',
                    zIndex: 1,
                    flexShrink: 0
                }}>
                    {actions ? (
                        <Stack spacing={compact ? 1 : 1.5}>
                            {actions}
                        </Stack>
                    ) : (
                        <Stack direction="row" spacing={1.25} sx={{ width: '100%' }}>
                            {onEdit && (
                                <Button
                                    variant="text"
                                    startIcon={<EditIcon fontSize="small" />}
                                    onClick={onEdit}
                                    sx={{
                                        flex: onDelete ? 0.65 : 1,
                                        minWidth: 0,
                                        borderRadius: '8px',
                                        textTransform: 'none',
                                        fontWeight: 700,
                                        fontSize: '0.84rem',
                                        py: 0.85,
                                        px: 1.5,
                                        minHeight: '40px',
                                        bgcolor: 'rgba(255, 255, 255, 0.1)',
                                        color: '#ffffff !important',
                                        border: '1px solid rgba(255, 255, 255, 0.18)',
                                        backdropFilter: 'blur(8px)',
                                        whiteSpace: 'nowrap',
                                        transition: 'all 0.2s ease',
                                        '& .MuiButton-startIcon': {
                                            mr: 0.75,
                                            display: 'flex',
                                            alignItems: 'center'
                                        },
                                        '&:hover': {
                                            bgcolor: 'rgba(255, 255, 255, 0.18)',
                                            borderColor: 'rgba(255, 255, 255, 0.32)',
                                            transform: 'translateY(-1px)'
                                        }
                                    }}
                                >
                                    {editLabel}
                                </Button>
                            )}
                            {onDelete && (
                                <Button
                                    variant="text"
                                    startIcon={<DeleteIcon fontSize="small" sx={{ color: '#ef4444 !important' }} />}
                                    onClick={onDelete}
                                    sx={{
                                        flex: onEdit ? 0.35 : 1,
                                        minWidth: 0,
                                        borderRadius: '8px',
                                        textTransform: 'none',
                                        fontWeight: 700,
                                        fontSize: '0.84rem',
                                        py: 0.85,
                                        px: 1.5,
                                        minHeight: '40px',
                                        bgcolor: 'rgba(255, 255, 255, 0.1)',
                                        color: '#ef4444 !important',
                                        border: '1px solid rgba(255, 255, 255, 0.18)',
                                        backdropFilter: 'blur(8px)',
                                        whiteSpace: 'nowrap',
                                        transition: 'all 0.2s ease',
                                        '& .MuiButton-startIcon': {
                                            mr: 0.75,
                                            display: 'flex',
                                            alignItems: 'center'
                                        },
                                        '&:hover': {
                                            bgcolor: 'rgba(255, 255, 255, 0.18)',
                                            borderColor: 'rgba(255, 255, 255, 0.32)',
                                            color: '#f87171 !important',
                                            transform: 'translateY(-1px)'
                                        }
                                    }}
                                >
                                    {deleteLabel}
                                </Button>
                            )}
                        </Stack>
                    )}
                </Box>
            )}
        </Paper>
    );
};
