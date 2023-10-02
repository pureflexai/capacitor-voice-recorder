import { WebPlugin } from '@capacitor/core';

import { VoiceRecorderImpl } from './VoiceRecorderImpl';
import type { CurrentRecordingStatus, GenericResponse, RecordingData, VoiceRecorderPlugin } from './definitions';

export class VoiceRecorderWeb extends WebPlugin implements VoiceRecorderPlugin {
  public voiceRecorderInstance = new VoiceRecorderImpl();

  public canDeviceVoiceRecord(): Promise<GenericResponse> {
    return VoiceRecorderImpl.canDeviceVoiceRecord();
  }

  public hasAudioRecordingPermission(): Promise<GenericResponse> {
    return VoiceRecorderImpl.hasAudioRecordingPermission();
  }

  public requestAudioRecordingPermission(): Promise<GenericResponse> {
    return VoiceRecorderImpl.requestAudioRecordingPermission();
  }

  public startRecording(timeSlice: number | null): Promise<GenericResponse> {
    return this.voiceRecorderInstance.startRecording(timeSlice);
  }

  public stopRecording(): Promise<RecordingData> {
    return this.voiceRecorderInstance.stopRecording();
  }

  public pauseRecording(): Promise<GenericResponse> {
    return this.voiceRecorderInstance.pauseRecording();
  }

  public resumeRecording(): Promise<GenericResponse> {
    return this.voiceRecorderInstance.resumeRecording();
  }

  public getCurrentStatus(): Promise<CurrentRecordingStatus> {
    return this.voiceRecorderInstance.getCurrentStatus();
  }

  public accessChunks(): string[] {
    return this.voiceRecorderInstance.accessChunks();
  }

  public accessBuffers(): ArrayBuffer[] {
    return this.voiceRecorderInstance.accessBuffers();
  }

  public requestData(): void {
    this.voiceRecorderInstance.requestData();
  }

  public trimChunks(): void {
    this.voiceRecorderInstance.trimChunks();
  }

  public trimBuffers(): void {
    this.voiceRecorderInstance.trimBuffers();
  }
}
