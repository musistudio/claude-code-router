import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { ActionButton } from './ActionButton';
import type { ActionButtonProps } from './ActionButton';

interface ModalWindowProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  size?: 'small' | 'normal' | 'large';
}

interface ModalButton {
  label: string;
  variant?: ActionButtonProps['variant'];
  onClick: () => void;
  loading?: boolean;
}

export function ModalWindow({
  title,
  isOpen,
  onClose,
  children,
  className = '',
  actions,
  size = 'normal',
}: ModalWindowProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Handle escape key and backdrop click
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    const handleBackdropClick = (e: MouseEvent) => {
      if (
        backdropRef.current &&
        e.target === backdropRef.current &&
        isOpen
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('mousedown', handleBackdropClick);
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleBackdropClick);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Focus trap
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      if (focusableElements.length > 0) {
        (focusableElements[0] as HTMLElement).focus();
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Size classes
  const sizeClasses = {
    small: 'max-w-md mx-auto',
    normal: 'max-w-lg mx-auto',
    large: 'max-w-2xl mx-auto',
  };

  return (
    <div
      ref={backdropRef}
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        ref={modalRef}
        className={`modal-window bg-white rounded-lg shadow-xl w-full transform transition-all ${
          sizeClasses[size]
        } ${className}`}
      >
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title text-lg font-semibold text-gray-900">
            {title}
          </h2>
          
          {/* Close button */}
          <ActionButton
            variant="secondary"
            size="small"
            onClick={onClose}
            className="ml-2"
            icon={<X className="h-4 w-4" />}
          >
            Close
          </ActionButton>
        </div>

        {/* Body */}
        <div className="modal-body">
          {children}
        </div>

        {/* Footer with actions */}
        {actions && (
          <div className="modal-footer">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

// Convenience component for default action buttons
export function ModalActions({
  onClose,
  onSave,
  saving = false,
  saveLabel = 'Save',
  showClose = true,
}: {
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
  showClose?: boolean;
}) {
  return (
    <div className="flex justify-end gap-3">
      {showClose && (
        <ActionButton
          variant="secondary"
          onClick={onClose}
        >
          Cancel
        </ActionButton>
      )}
      <ActionButton
        variant="primary"
        loading={saving}
        onClick={onSave}
      >
        {saveLabel}
      </ActionButton>
    </div>
  );
}