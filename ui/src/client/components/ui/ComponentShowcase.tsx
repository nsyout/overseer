import { useState } from "react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { Card, CardHeader, CardContent, CardFooter } from "./Card";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import { Kbd } from "./Kbd";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "./Dialog";

/**
 * Component showcase for testing all UI primitives and their variants.
 * Renders each component in isolation with all variants visible.
 */
export function ComponentShowcase() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<number | null>(null);

  return (
    <div className="p-8 space-y-12 bg-bg-primary min-h-screen">
      {/* Buttons */}
      <section>
        <h2 className="text-lg font-medium text-text-primary mb-4">Button</h2>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" size="sm">
              Small
            </Button>
            <Button variant="primary" size="md">
              Medium
            </Button>
            <Button variant="primary" size="lg">
              Large
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" disabled>
              Disabled
            </Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
          </div>
        </div>
      </section>

      {/* Badges */}
      <section>
        <h2 className="text-lg font-medium text-text-primary mb-4">Badge</h2>
        <div className="flex flex-wrap gap-3">
          <Badge variant="pending">Pending</Badge>
          <Badge variant="active">Active</Badge>
          <Badge variant="blocked">Blocked</Badge>
          <Badge variant="done">Done</Badge>
        </div>
      </section>

      {/* Cards */}
      <section>
        <h2 className="text-lg font-medium text-text-primary mb-4">Card</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <span className="text-sm font-medium text-text-primary">
                Basic Card
              </span>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-muted">
                Default card with no special props.
              </p>
            </CardContent>
          </Card>

          <Card
            interactive
            selected={selectedCard === 1}
            onClick={() => setSelectedCard(selectedCard === 1 ? null : 1)}
          >
            <CardHeader>
              <span className="text-sm font-medium text-text-primary">
                Interactive Card
              </span>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-muted">
                Click me! {selectedCard === 1 ? "(Selected)" : "(Not selected)"}
              </p>
            </CardContent>
          </Card>

          <Card selected>
            <CardHeader>
              <span className="text-sm font-medium text-text-primary">
                Selected Card
              </span>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-muted">Always selected state.</p>
            </CardContent>
            <CardFooter>
              <span className="text-xs text-text-dim">Footer content</span>
            </CardFooter>
          </Card>
        </div>
      </section>

      {/* Inputs */}
      <section>
        <h2 className="text-lg font-medium text-text-primary mb-4">Input</h2>
        <div className="space-y-4 max-w-md">
          <div className="flex gap-3">
            <Input size="sm" placeholder="Small input" />
            <Input size="md" placeholder="Medium input" />
            <Input size="lg" placeholder="Large input" />
          </div>
          <Input placeholder="Default placeholder" />
          <Input defaultValue="With value" />
          <Input disabled placeholder="Disabled input" />
        </div>
      </section>

      {/* Textarea */}
      <section>
        <h2 className="text-lg font-medium text-text-primary mb-4">Textarea</h2>
        <div className="space-y-4 max-w-md">
          <Textarea placeholder="Default textarea..." />
          <Textarea size="sm" placeholder="Small textarea..." />
          <Textarea disabled placeholder="Disabled textarea..." />
        </div>
      </section>

      {/* Kbd */}
      <section>
        <h2 className="text-lg font-medium text-text-primary mb-4">Kbd</h2>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Kbd size="sm">A</Kbd>
            <Kbd size="md">B</Kbd>
            <Kbd size="lg">C</Kbd>
          </div>
          <div className="flex items-center gap-1 text-text-muted text-sm">
            Press <Kbd>Cmd</Kbd> + <Kbd>K</Kbd> to search
          </div>
          <div className="flex items-center gap-1 text-text-muted text-sm">
            <Kbd>Esc</Kbd> to close
          </div>
          <div className="flex items-center gap-1 text-text-muted text-sm">
            <Kbd>?</Kbd> for help
          </div>
        </div>
      </section>

      {/* Dialog */}
      <section>
        <h2 className="text-lg font-medium text-text-primary mb-4">Dialog</h2>
        <Button onClick={() => setDialogOpen(true)}>Open Dialog</Button>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>
              This is a dialog description providing additional context.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              <p className="text-sm text-text-muted">
                Dialog body content goes here. You can put any content including
                forms, lists, or other components.
              </p>
              <Input placeholder="Example input in dialog" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => setDialogOpen(false)}>
              Confirm
            </Button>
          </DialogFooter>
        </Dialog>
      </section>
    </div>
  );
}
