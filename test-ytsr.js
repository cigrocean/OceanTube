import { YouTube } from 'youtube-sr';

console.log('Named export keys:', Object.keys(YouTube || {}));
console.log('Is search in named?', typeof YouTube.search);
