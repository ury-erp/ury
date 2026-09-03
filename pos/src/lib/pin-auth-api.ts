import { call } from '@ury/core';

const STATUS_METHOD = 'ury.ury.api.pos_pin.get_pin_login_status';
const LOGIN_METHOD = 'ury.ury.api.pos_pin.login_with_pin';

export interface PinLoginStatus {
  enabled: boolean;
  authenticated?: boolean;
  min_length: number;
  max_length: number;
}

export interface PinLoginResult {
  user: string;
  full_name: string;
  redirect_to: string;
}

function unwrapMessage<T>(response: T | { message: T }): T {
  if (response && typeof response === 'object' && 'message' in response) {
    return (response as { message: T }).message;
  }
  return response as T;
}

export async function getPinLoginStatus(): Promise<PinLoginStatus> {
  const response = await call.get(STATUS_METHOD);
  return unwrapMessage<PinLoginStatus>(response);
}

export async function loginWithPin(pin: string): Promise<PinLoginResult> {
  const response = await call.post(LOGIN_METHOD, { pin });
  return unwrapMessage<PinLoginResult>(response);
}
