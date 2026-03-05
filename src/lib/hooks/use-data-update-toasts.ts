"use client";

import { useEffect } from "react";
import { useToast } from "@/lib/hooks/use-toast";

export function useDataUpdateToasts() {
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined" || !window.mdc) return;

    // Listen for toast events from main process
    const unsubscribeToast = window.mdc.on("toast:show", (data: any) => {
      const { variant, title, description } = data;
      
      toast({
        variant: variant || "default",
        title: title,
        description: description,
      });
    });

    return () => {
      unsubscribeToast?.();
    };
  }, [toast]);
}
