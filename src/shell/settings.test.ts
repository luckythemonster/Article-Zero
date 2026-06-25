import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings } from './settings';

describe('settings', () => {
  const KEY = "articlezero.settings";

  beforeEach(() => {
    localStorage.clear();
  });

  it('returns default settings when localStorage is empty', () => {
    const settings = loadSettings();
    expect(settings.humCap).toBe(0.1);
  });

  it('loads saved settings', () => {
    localStorage.setItem(KEY, JSON.stringify({ humCap: 0.5 }));
    const settings = loadSettings();
    expect(settings.humCap).toBe(0.5);
  });

  it('returns default settings when localStorage has invalid JSON', () => {
    localStorage.setItem(KEY, '{ invalid: json }');
    const settings = loadSettings();
    expect(settings.humCap).toBe(0.1);
    expect(settings.llmEnabled).toBe(false);
  });
});
