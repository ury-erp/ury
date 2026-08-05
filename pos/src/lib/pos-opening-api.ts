import { call, apiRegistry } from '@ury/core';

export interface POSOpeningResponse {
  message: number;
}

export interface POSCloseValidationResponse {
  message: string;
}

export const checkPOSOpening = async (): Promise<POSOpeningResponse> => {
  const endpoint = apiRegistry.getUrl('CHECK_POS_OPENING');
  try {
    const response = await call.get<POSOpeningResponse>(endpoint);
    return response;
  } catch (error) {
    console.error('Error checking POS opening status:', error);
    throw error;
  }
};

export const validatePOSClose = async (posProfile: string): Promise<POSCloseValidationResponse> => {
  const endpoint = apiRegistry.getUrl('VALIDATE_POS_CLOSE');
  try {
    const response = await call.get<POSCloseValidationResponse>(
      endpoint,
      {
        pos_profile: posProfile
      }
    );
    return response;
  } catch (error) {
    console.error('Error validating POS close status:', error);
    throw error;
  }
};