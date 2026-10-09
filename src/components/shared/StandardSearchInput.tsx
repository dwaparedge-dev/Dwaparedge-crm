'use client';
/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import React from 'react';
import {
    TextField,
    InputAdornment,
    IconButton,
    Tooltip,
    useTheme,
    alpha,
    SxProps,
    Theme,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

export interface StandardSearchInputProps {
    /** Current search query value */
    value: string;
    /** Change handler returning string or event */
    onChange: (value: string) => void;
    /** Optional explicit clear handler */
    onClear?: () => void;
    /** Placeholder text (default: 'Search...') */
    placeholder?: string;
    /** Custom min-width for responsive scaling */
    minWidth?: any;
    /** Whether full width on container */
    fullWidth?: boolean;
    /** Disabled state */
    disabled?: boolean;
    /** Auto focus on mount */
    autoFocus?: boolean;
    /** Tooltip for clear button */
    clearTooltip?: string;
    /** Custom SX overrides */
    sx?: SxProps<Theme>;
}

/**
 * Standardized Search Input component for FactoONE.
 * Enforces the glassmorphic inset styling, 38px unified height,
 * 10px rounded corners, search icon adornment, and dynamic clear button.
 */
export const StandardSearchInput: React.FC<StandardSearchInputProps> = ({
    value,
    onChange,
    onClear,
    placeholder = 'Search...',
    minWidth = { xs: '100%', sm: 240, md: 300 },
    fullWidth = false,
    disabled = false,
    autoFocus = false,
    clearTooltip = 'Clear search',
    sx = {},
}) => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const handleClear = () => {
        onChange('');
        if (onClear) {
            onClear();
        }
    };

    return (
        <TextField
            size="small"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            fullWidth={fullWidth}
            slotProps={{
                input: {
                    startAdornment: (
                        <InputAdornment position="start" sx={{ mr: 0.75 }}>
                            <SearchRoundedIcon
                                sx={{
                                    color: theme.palette.text.secondary,
                                    fontSize: 19,
                                }}
                            />
                        </InputAdornment>
                    ),
                    endAdornment: Boolean(value) && !disabled ? (
                        <InputAdornment position="end">
                            <Tooltip title={clearTooltip}>
                                <IconButton
                                    size="small"
                                    onClick={handleClear}
                                    sx={{
                                        p: 0.35,
                                        color: 'text.secondary',
                                        '&:hover': {
                                            color: 'text.primary',
                                            bgcolor: alpha(theme.palette.text.primary, 0.06),
                                        },
                                    }}
                                >
                                    <CloseRoundedIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </Tooltip>
                        </InputAdornment>
                    ) : null,
                }
            }}
            sx={{
                minWidth: fullWidth ? '100%' : minWidth,
                '& .MuiOutlinedInput-root': {
                    height: 38,
                    paddingLeft: '14px !important', // Force left padding
                    paddingRight: '14px !important', // Force right padding
                    borderRadius: '10px',
                    fontSize: '0.84rem',
                    backdropFilter: 'blur(10px)',
                    bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.9)',
                    border: '1.5px solid',
                    borderColor: isDark ? 'rgba(255,255,255,0.22)' : '#94a3b8',
                    boxShadow: isDark
                        ? 'inset 0 1px 2px rgba(0,0,0,0.3)'
                        : 'inset 0 1px 2px rgba(15,23,42,0.04), 0 1px 2px rgba(0,0,0,0.03)',
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box', 
                    '& fieldset': {
                        border: 'none',
                    },
                    '&:hover': {
                        bgcolor: isDark ? 'rgba(255,255,255,0.06)' : '#ffffff',
                        borderColor: isDark ? 'rgba(255,255,255,0.38)' : '#475569',
                    },
                    '&.Mui-focused': {
                        bgcolor: isDark ? 'rgba(255,255,255,0.07)' : '#ffffff',
                        borderColor: theme.palette.primary.main,
                        boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.18)}, inset 0 1px 2px rgba(0,0,0,0.02)`,
                    },
                    '& .MuiInputAdornment-root': {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: '0 !important', 
                    },
                    '& .MuiInputAdornment-positionStart': {
                        marginRight: '8px',
                    },
                    '& .MuiInputAdornment-positionEnd': {
                        marginLeft: '8px',
                    }
                },
                '& .MuiOutlinedInput-input': {
                    padding: '8px 0', // Override the default MUI input padding to center text vertically within 38px
                    height: '100%',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center'
                },
                ...sx,
            }}
        />
    );
};

export default StandardSearchInput;
