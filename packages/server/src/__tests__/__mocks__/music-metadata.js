// Mock music-metadata module for Jest
module.exports = {
  parseFile: jest.fn().mockResolvedValue({
    format: {
      duration: 180,
      container: 'MP3',
    },
    common: {
      title: 'Test Track',
      artist: 'Test Artist',
      album: 'Test Album',
      genre: ['Electronic'],
      year: 2024,
      bpm: 128,
      key: 'Am',
      track: { no: 1 },
      picture: [],
    },
  }),
};
