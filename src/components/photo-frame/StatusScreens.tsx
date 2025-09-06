"use client";

import { Loader2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function LoadingScreen() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-background text-foreground">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="mt-4 text-lg">Searching for photos...</p>
    </div>
  );
}

interface ErrorScreenProps {
  error: string;
}
export function ErrorScreen({ error }: ErrorScreenProps) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
      <Alert variant="destructive" className="max-w-lg">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    </div>
  );
}

export function NoMediaScreen() {
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
            <Alert className="max-w-md">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No Media To Display</AlertTitle>
                <AlertDescription>
                Could not find any suitable photos on your Immich server. Check your configuration or asset availability.
                </AlertDescription>
            </Alert>
        </div>
    );
}
