'use client';

import * as React from 'react';

interface DialogProps { open?: boolean; onOpenChange?: (open: boolean) => void; children?: React.ReactNode; }
function Dialog({ open, onOpenChange, children }: DialogProps) {
  return open ? <>{children}</> : null;
}
function DialogTrigger({ onClick, children }: { onClick?: () => void; children?: React.ReactNode }) {
  return <span onClick={onClick}>{children}</span>;
}
function DialogPortal({ children }: { children?: React.ReactNode }) { return <>{children}</>; }
function DialogOverlay({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`fixed inset-0 bg-black/30 z-50 ${className ?? ''}`} {...props} />;
}
function DialogClose({ onClick, children }: { onClick?: () => void; children?: React.ReactNode }) {
  return <button type="button" onClick={onClick}>{children}</button>;
}
function DialogContent({ className, children }: { className?: string; children?: React.ReactNode; showCloseButton?: boolean }) {
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center`}>
      <div className={`relative rounded-xl bg-white p-4 shadow-xl ${className ?? ''}`}>{children}</div>
    </div>
  );
}
function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`flex flex-col gap-2 ${className ?? ''}`} {...props} />;
}
function DialogFooter({ className, children, showCloseButton }: React.HTMLAttributes<HTMLDivElement> & { showCloseButton?: boolean }) {
  return <div className={`flex gap-2 justify-end ${className ?? ''}`}>{children}</div>;
}
function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={`text-base font-medium ${className ?? ''}`} {...props} />;
}
function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`text-sm text-muted-foreground ${className ?? ''}`} {...props} />;
}

export {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger,
};
