import getBlobDuration from 'get-blob-duration';

import type { Base64String, CurrentRecordingStatus, GenericResponse, RecordingData } from './definitions';
import {
  alreadyRecordingError,
  couldNotQueryPermissionStatusError,
  deviceCannotVoiceRecordError,
  emptyRecordingError,
  failedToFetchRecordingError,
  failedToRecordError,
  failureResponse,
  missingPermissionError,
  recordingHasNotStartedError,
  successResponse,
} from './predefined-web-responses';

// these mime types will be checked one by one in order until one of them is found to be supported by the current browser
const possibleMimeTypes = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus'];
const neverResolvingPromise = (): Promise<any> => new Promise(() => undefined);

export class VoiceRecorderImpl {
  public mediaRecorder: MediaRecorder | null = null;
  public chunks: any[] = [];
  public readableChunks: string[] = [];
  public readableBuffers: ArrayBuffer[] = [];
  public mediaStream: MediaStream | undefined = undefined;
  public pendingResult: Promise<RecordingData> = neverResolvingPromise();

  public static async canDeviceVoiceRecord(): Promise<GenericResponse> {
    if (navigator?.mediaDevices?.getUserMedia == null || VoiceRecorderImpl.getSupportedMimeType() == null) {
      return failureResponse();
    } else {
      return successResponse();
    }
  }

  public async startRecording(timeSlice: number | null): Promise<GenericResponse> {
    if (this.mediaRecorder != null) {
      throw alreadyRecordingError();
    }
    const deviceCanRecord = await VoiceRecorderImpl.canDeviceVoiceRecord();
    if (!deviceCanRecord.value) {
      throw deviceCannotVoiceRecordError();
    }
    const havingPermission = await VoiceRecorderImpl.hasAudioRecordingPermission().catch(() => successResponse());
    if (!havingPermission.value) {
      throw missingPermissionError();
    }
    return navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((m) => {
        return this.onSuccessfullyStartedRecording(m, timeSlice);
      })
      .catch(this.onFailedToStartRecording.bind(this));
  }

  public async stopRecording(): Promise<RecordingData> {
    if (this.mediaRecorder == null) {
      throw recordingHasNotStartedError();
    }
    try {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      return this.pendingResult;
    } catch (ignore) {
      throw failedToFetchRecordingError();
    } finally {
      this.prepareInstanceForNextOperation();
    }
  }

  public static async hasAudioRecordingPermission(): Promise<GenericResponse> {
    return navigator.permissions
      .query({ name: 'microphone' as any })
      .then((result) => ({ value: result.state === 'granted' }))
      .catch(() => {
        throw couldNotQueryPermissionStatusError();
      });
  }

  public static async requestAudioRecordingPermission(): Promise<GenericResponse> {
    const havingPermission = await VoiceRecorderImpl.hasAudioRecordingPermission().catch(() => failureResponse());
    if (havingPermission.value) {
      return successResponse();
    }

    return navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(() => successResponse())
      .catch(() => failureResponse());
  }

  public pauseRecording(): Promise<GenericResponse> {
    if (this.mediaRecorder == null) {
      throw recordingHasNotStartedError();
    } else if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      return Promise.resolve(successResponse());
    } else {
      return Promise.resolve(failureResponse());
    }
  }

  public resumeRecording(): Promise<GenericResponse> {
    if (this.mediaRecorder == null) {
      throw recordingHasNotStartedError();
    } else if (this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      return Promise.resolve(successResponse());
    } else {
      return Promise.resolve(failureResponse());
    }
  }

  public getCurrentStatus(): Promise<CurrentRecordingStatus> {
    if (this.mediaRecorder == null) {
      return Promise.resolve({ status: 'NONE' });
    } else if (this.mediaRecorder.state === 'recording') {
      return Promise.resolve({ status: 'RECORDING' });
    } else if (this.mediaRecorder.state === 'paused') {
      return Promise.resolve({ status: 'PAUSED' });
    } else {
      return Promise.resolve({ status: 'NONE' });
    }
  }

  public static getSupportedMimeType(): string | null {
    if (MediaRecorder?.isTypeSupported == null) return null;
    const foundSupportedType = possibleMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
    return foundSupportedType ?? null;
  }

  private onSuccessfullyStartedRecording(stream: MediaStream, timeSliceSet: number | null): GenericResponse {
    this.pendingResult = new Promise((resolve, reject) => {
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.onerror = () => {
        this.prepareInstanceForNextOperation();
        reject(failedToRecordError());
      };
      this.mediaRecorder.onstop = async () => {
        const mimeType = VoiceRecorderImpl.getSupportedMimeType();
        if (mimeType == null) {
          this.prepareInstanceForNextOperation();
          reject(failedToFetchRecordingError());
          return;
        }
        const blobVoiceRecording = new Blob(this.chunks, { type: mimeType });
        if (blobVoiceRecording.size <= 0) {
          this.prepareInstanceForNextOperation();
          reject(emptyRecordingError());
          return;
        }
        const recordDataBase64 = await VoiceRecorderImpl.blobToBase64(blobVoiceRecording);
        const recordingDuration = await getBlobDuration(blobVoiceRecording);
        this.prepareInstanceForNextOperation();
        resolve({ value: { recordDataBase64, mimeType, msDuration: recordingDuration * 1000 } });
      };
      this.mediaRecorder.ondataavailable = (event: any) => {
        this.chunks.push(event.data);
        const mimeType = VoiceRecorderImpl.getSupportedMimeType();
        if (mimeType === null) {
          return;
        }
        VoiceRecorderImpl.blobToBase64(new Blob(this.chunks, { type: mimeType as string })).then((r) => {
          this.readableChunks.push(r);
        });
        VoiceRecorderImpl.blobToBuffer(new Blob(this.chunks, { type: mimeType as string })).then((r) => {
          this.readableBuffers.push(r);
        });
      };
      if (timeSliceSet === null) {
        this.mediaRecorder.start();
      } else {
        this.mediaRecorder.start(timeSliceSet);
      }
    });
    return successResponse();
  }

  private onFailedToStartRecording(): GenericResponse {
    this.prepareInstanceForNextOperation();
    throw failedToRecordError();
  }

  private static blobToBase64(blob: Blob): Promise<Base64String> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const recordingResult = String(reader.result);
        resolve(recordingResult.trim());
      };
      reader.readAsDataURL(blob);
    });
  }

  private static blobToBuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const recordingResult = reader.result as ArrayBuffer;
        resolve(recordingResult);
      };
      reader.readAsArrayBuffer(blob);
    });
  }

  private prepareInstanceForNextOperation(): void {
    if (this.mediaRecorder != null && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch (ignore) {}
    }
    this.pendingResult = neverResolvingPromise();
    this.mediaRecorder = null;
    this.chunks = [];
  }

  public accessChunks(): string[] {
    return this.readableChunks;
  }

  public accessBuffers(): ArrayBuffer[] {
    return this.readableBuffers;
  }

  public requestData(): void {
    this.mediaRecorder?.requestData();
  }

  public trimChunks(): void {
    this.readableChunks.shift();
  }

  public trimBuffers(): void {
    this.readableBuffers.shift();
  }
}
