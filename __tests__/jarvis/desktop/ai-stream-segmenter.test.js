const { AiStreamSegmenter } = require('@/jarvis/desktop/ai-stream-segmenter');

describe('AiStreamSegmenter', () => {
  it('emits segments on punctuation after minimum words', () => {
    const segmenter = new AiStreamSegmenter({ minWords: 5, maxWords: 12 });
    const output = [];
    output.push(...segmenter.pushToken('Hello there this is a streaming test, '));
    output.push(...segmenter.pushToken('and it should split soon. Next sentence starts.'));
    output.push(...segmenter.flush());
    expect(output.length).toBeGreaterThanOrEqual(2);
    expect(output[0]).toContain('streaming test,');
    expect(output[1]).toContain('Next sentence starts.');
  });

  it('falls back to max words when punctuation never arrives', () => {
    const segmenter = new AiStreamSegmenter({ minWords: 4, maxWords: 6 });
    const output = [];
    output.push(...segmenter.pushToken('one two three four five six seven eight nine'));
    output.push(...segmenter.flush());
    expect(output.length).toBeGreaterThanOrEqual(2);
    expect(output[0].split(' ').length).toBeLessThanOrEqual(7);
  });

  it('flushes remaining short tail', () => {
    const segmenter = new AiStreamSegmenter({ minWords: 6, maxWords: 12 });
    const output = [];
    output.push(...segmenter.pushToken('small tail only'));
    output.push(...segmenter.flush());
    expect(output).toEqual(['small tail only']);
  });
});
