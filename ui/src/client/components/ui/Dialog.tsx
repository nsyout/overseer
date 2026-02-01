import { tv } from "tailwind-variants";
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";

// Context for ARIA ID associations
interface DialogContextValue {
  titleId: string;
  descriptionId: string;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog components must be used within a Dialog");
  }
  return context;
}

const dialogContent = tv({
  base: [
    "fixed left-1/2 top-1/2 z-50",
    "-translate-x-1/2 -translate-y-1/2",
    "w-full max-w-lg max-h-[85vh]",
    "shadow-lg overflow-auto",
    "focus:outline-none",
  ],
});

const dialogHeader = tv({
  base: "px-6 py-4 border-b border-border",
});

const dialogTitle = tv({
  base: "font-mono text-lg font-medium text-text-primary",
});

const dialogDescription = tv({
  base: "font-mono text-sm text-text-muted mt-1",
});

const dialogBody = tv({
  base: "px-6 py-4",
});

const dialogFooter = tv({
  base: "px-6 py-4 border-t border-border flex justify-end gap-2",
});

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => onOpenChange(false);
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onOpenChange]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const rect = dialog.getBoundingClientRect();
    const isInDialog =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;

    if (!isInDialog) {
      onOpenChange(false);
    }
  };

  return (
    <DialogContext.Provider value={{ titleId, descriptionId }}>
      <dialog
        ref={dialogRef}
        className={dialogContent()}
        onClick={handleBackdropClick}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        style={{
          // Override default dialog styles
          padding: 0,
          border: "none",
          background: "transparent",
        }}
      >
        <div className="bg-surface-primary border border-border rounded-lg">
          {children}
        </div>
      </dialog>
    </DialogContext.Provider>
  );
}

interface DialogHeaderProps extends HTMLAttributes<HTMLDivElement> {}

export function DialogHeader({ className, ...props }: DialogHeaderProps) {
  return <div className={dialogHeader({ className })} {...props} />;
}

interface DialogTitleProps extends HTMLAttributes<HTMLHeadingElement> {}

export const DialogTitle = forwardRef<HTMLHeadingElement, DialogTitleProps>(
  ({ className, ...props }, ref) => {
    const { titleId } = useDialogContext();
    return (
      <h2
        ref={ref}
        id={titleId}
        className={dialogTitle({ className })}
        {...props}
      />
    );
  }
);

DialogTitle.displayName = "DialogTitle";

interface DialogDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {}

export function DialogDescription({
  className,
  ...props
}: DialogDescriptionProps) {
  const { descriptionId } = useDialogContext();
  return (
    <p id={descriptionId} className={dialogDescription({ className })} {...props} />
  );
}

interface DialogBodyProps extends HTMLAttributes<HTMLDivElement> {}

export function DialogBody({ className, ...props }: DialogBodyProps) {
  return <div className={dialogBody({ className })} {...props} />;
}

interface DialogFooterProps extends HTMLAttributes<HTMLDivElement> {}

export function DialogFooter({ className, ...props }: DialogFooterProps) {
  return <div className={dialogFooter({ className })} {...props} />;
}
