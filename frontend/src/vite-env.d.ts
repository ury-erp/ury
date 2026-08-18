/// <reference types="vite/client" />

declare module '@ury/core' {
  export function call<T = any>(method: string, args?: any): Promise<T>;
  export function validateFieldValue(field: any, value: any): { valid: boolean; message: string };
}

declare module '@ury/ui' {
  import React from 'react';
  export const Button: React.ForwardRefExoticComponent<any>;
  export const Input: React.ForwardRefExoticComponent<any>;
  export const Card: React.ForwardRefExoticComponent<any>;
  export const CardContent: React.ForwardRefExoticComponent<any>;
  export const CardHeader: React.ForwardRefExoticComponent<any>;
  export const CardTitle: React.ForwardRefExoticComponent<any>;
  export const CardDescription: React.ForwardRefExoticComponent<any>;
}
