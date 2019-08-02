import { getContext } from "../Global";
import { Tone } from "../Tone";
import { Samples, Seconds, Time } from "../type/Units";
import { optionsFromArguments } from "../util/Defaults";
import { noOp } from "../util/Interface";
import { isArray, isNumber, isString } from "../util/TypeCheck";

interface ToneAudioBufferOptions {
	url?: string | AudioBuffer | ToneAudioBuffer;
	reverse: boolean;
	onload: (buffer?: ToneAudioBuffer) => void;
	onerror: (error: Error) => void;
}

/**
 * AudioBuffer loading and storage. ToneAudioBuffer is used internally by all
 * classes that make requests for audio files such as Tone.Player,
 * Tone.Sampler and Tone.Convolver.
 *
 * Aside from load callbacks from individual buffers, ToneAudioBuffer
 * provides events which keep track of the loading progress
 * of _all_ of the buffers. These are ToneAudioBuffer.on("load" / "progress" / "error")
 *
 * @param url The url to load, or the audio buffer to set.
 * @param onload A callback which is invoked after the buffer is loaded.
 *                            It's recommended to use `ToneAudioBuffer.on('load', callback)` instead
 *                            since it will give you a callback when _all_ buffers are loaded.
 * @param onerror The callback to invoke if there is an error
 * @example
 * var buffer = new ToneAudioBuffer("path/to/sound.mp3", function(){
 * 	//the buffer is now available.
 * 	var buff = buffer.get();
 * });
 * @example
 * //can load provide fallback extension types if the first type is not supported.
 * var buffer = new ToneAudioBuffer("path/to/sound.[mp3|ogg|wav]");
 */
export class ToneAudioBuffer extends Tone {

	name = "ToneAudioBuffer";

	/**
	 *  stores the loaded AudioBuffer
	 */
	private _buffer?: AudioBuffer;

	/**
	 *  indicates if the buffer should be reversed or not
	 */
	private _reversed!: boolean;

	/**
	 * Callback when the buffer is loaded.
	 */
	onload: (buffer: ToneAudioBuffer) => void = noOp;

	constructor(options?: Partial<ToneAudioBufferOptions>);
	constructor(
		url?: string | ToneAudioBuffer | AudioBuffer,
		onload?: (buffer: ToneAudioBuffer) => void,
		onerror?: (error: Error) => void,
	);
	constructor() {

		super();

		const options = optionsFromArguments(ToneAudioBuffer.getDefaults(), arguments, ["url", "onload", "onerror"]);

		this.reverse = options.reverse;
		this.onload = options.onload;

		if (options.url && options.url instanceof AudioBuffer || options.url instanceof ToneAudioBuffer) {
			this.set(options.url);
		} else if (isString(options.url)) {
			// initiate the download
			this.load(options.url).catch(options.onerror);
		}
	}

	static getDefaults(): ToneAudioBufferOptions {
		return {
			onerror: noOp,
			onload: noOp,
			reverse: false,
		};
	}

	/**
	 * The sample rate of the AudioBuffer
	 */
	get sampleRate(): number {
		if (this._buffer) {
			return this._buffer.sampleRate;
		} else {
			return getContext().sampleRate;
		}
	}

	/**
	 *  Pass in an AudioBuffer or ToneAudioBuffer to set the value of this buffer.
	 */
	set(buffer: AudioBuffer | ToneAudioBuffer): this {
		if (buffer instanceof ToneAudioBuffer) {
			// if it's loaded, set it
			if (buffer.loaded) {
				this._buffer = buffer.get();
			} else {
				// otherwise when it's loaded, invoke it's callback
				buffer.onload = () => {
					this.set(buffer);
					this.onload(this);
				};
			}
		} else {
			this._buffer = buffer;
		}
		// reverse it initially
		if (this._reversed) {
			this._reverse();
		}
		return this;
	}

	/**
	 *  The audio buffer stored in the object.
	 */
	get(): AudioBuffer | undefined {
		return this._buffer;
	}

	/**
	 *  Makes an fetch request for the selected url then decodes the file as an audio buffer.
	 * 	Invokes the callback once the audio buffer loads.
	 *  @param url The url of the buffer to load. filetype support depends on the browser.
	 *  @returns A Promise which resolves with this ToneAudioBuffer
	 */
	async load(url: string): Promise<this> {
		const promise = ToneAudioBuffer.load(url);
		ToneAudioBuffer.downloads.push(promise);
		try {
			const audioBuffer = await promise;
			this.set(audioBuffer);
			// invoke the onload method
			this.onload(this);
		} catch (e) {
			// remove the failed file before throwing error
			const index = ToneAudioBuffer.downloads.indexOf(promise);
			ToneAudioBuffer.downloads.splice(index, 1);
			throw e;
		}
		return this;
	}

	/**
	 *  clean up
	 */
	dispose(): this {
		super.dispose();
		this._buffer = undefined;
		return this;
	}

	/**
	 * Set the audio buffer from the array.
	 * To create a multichannel AudioBuffer, pass in a multidimensional array.
	 * @param array The array to fill the audio buffer
	 */
	fromArray(array: Float32Array | Float32Array[]): this {
		const isMultidimensional = isArray(array) && array[0].length > 0;
		const channels = isMultidimensional ? array.length : 1;
		const len = isMultidimensional ? (array[0] as Float32Array).length : array.length;
		const context = getContext();
		const buffer = context.createBuffer(channels, len, context.sampleRate);
		const multiChannelArray: Float32Array[] = !isMultidimensional && channels === 1 ?
			[array as Float32Array] : array as Float32Array[];

		for (let c = 0; c < channels; c++) {
			buffer.copyToChannel(multiChannelArray[c], c);
		}
		this._buffer = buffer;
		return this;
	}

	/**
	 * 	Sums multiple channels into 1 channel
	 *  @param channel Optionally only copy a single channel from the array.
	 */
	toMono(chanNum?: number): this {
		if (isNumber(chanNum)) {
			this.fromArray(this.toArray(chanNum));
		} else {
			let outputArray = new Float32Array(this.length as number);
			const numChannels = this.numberOfChannels;
			for (let channel = 0; channel < numChannels; channel++) {
				const channelArray = this.toArray(channel) as Float32Array;
				for (let i = 0; i < channelArray.length; i++) {
					outputArray[i] += channelArray[i];
				}
			}
			// divide by the number of channels
			outputArray = outputArray.map(sample => sample / numChannels);
			this.fromArray(outputArray);
		}
		return this;
	}

	/**
	 * 	Get the buffer as an array. Single channel buffers will return a 1-dimensional
	 * 	Float32Array, and multichannel buffers will return multidimensional arrays.
	 *  @param channel Optionally only copy a single channel from the array.
	 */
	toArray(channel?: number): Float32Array | Float32Array[] {
		if (isNumber(channel)) {
			return this.getChannelData(channel);
		} else if (this.numberOfChannels === 1) {
			return this.toArray(0);
		} else {
			const ret: Float32Array[] = [];
			for (let c = 0; c < this.numberOfChannels; c++) {
				ret[c] = this.getChannelData(c);
			}
			return ret;
		}
	}

	/**
	 *  Returns the Float32Array representing the PCM audio data for the specific channel.
	 *  @param  channel  The channel number to return
	 *  @return The audio as a TypedArray
	 */
	getChannelData(channel: number): Float32Array {
		if (this._buffer) {
			return this._buffer.getChannelData(channel);
		} else {
			return new Float32Array(0);
		}
	}

	/**
	 *  Cut a subsection of the array and return a buffer of the
	 *  subsection. Does not modify the original buffer
	 *  @param start The time to start the slice
	 *  @param end The end time to slice. If none is given will default to the end of the buffer
	 */
	slice(start: Seconds, end: Seconds = this.duration): ToneAudioBuffer {
		const startSamples = Math.floor(start * this.sampleRate);
		const endSamples = Math.floor(end * this.sampleRate);
		this.assert(startSamples < endSamples, "The start time must be less than the end time");
		const length = endSamples - startSamples;
		const retBuffer = getContext().createBuffer(this.numberOfChannels, length, this.sampleRate);
		for (let channel = 0; channel < this.numberOfChannels; channel++) {
			retBuffer.copyToChannel(this.getChannelData(channel).subarray(startSamples, endSamples), channel);
		}
		return new ToneAudioBuffer(retBuffer);
	}

	/**
	 *  Reverse the buffer.
	 */
	private _reverse(): this {
		if (this.loaded) {
			for (let i = 0; i < this.numberOfChannels; i++) {
				this.getChannelData(i).reverse();
			}
		}
		return this;
	}

	/**
	 * If the buffer is loaded or not
	 */
	get loaded(): boolean {
		return this.length > 0;
	}

	/**
	 * The duration of the buffer in seconds.
	 */
	get duration(): Seconds {
		if (this._buffer) {
			return this._buffer.duration;
		} else {
			return 0;
		}
	}

	/**
	 * The length of the buffer in samples
	 */
	get length(): Samples {
		if (this._buffer) {
			return this._buffer.length;
		} else {
			return 0;
		}
	}

	/**
	 * The number of discrete audio channels. Returns 0 if no buffer is loaded.
	 */
	get numberOfChannels(): number {
		if (this._buffer) {
			return this._buffer.numberOfChannels;
		} else {
			return 0;
		}
	}

	/**
	 * Reverse the buffer.
	 */
	get reverse(): boolean {
		return this._reversed;
	}
	set reverse(rev: boolean) {
		if (this._reversed !== rev) {
			this._reversed = rev;
			this._reverse();
		}
	}

	///////////////////////////////////////////////////////////////////////////
	// STATIC METHODS
	///////////////////////////////////////////////////////////////////////////

	/**
	 *  A path which is prefixed before every url.
	 */
	static baseUrl = "";

	/**
	 *  Create a ToneAudioBuffer from the array. To create a multichannel AudioBuffer,
	 *  pass in a multidimensional array.
	 *  @param array The array to fill the audio buffer
	 *  @return A ToneAudioBuffer created from the array
	 */
	static fromArray(array: Float32Array | Float32Array[]): ToneAudioBuffer {
		return (new ToneAudioBuffer()).fromArray(array);
	}

	/**
	 * Creates a ToneAudioBuffer from a URL, returns a promise which resolves to a ToneAudioBuffer
	 * @param  url The url to load.
	 * @return A promise which resolves to a ToneAudioBuffer
	 */
	static async fromUrl(url: string): Promise<ToneAudioBuffer> {
		const buffer = new ToneAudioBuffer();
		return await buffer.load(url);
	}

	/**
	 * All of the downloads
	 */
	static downloads: Array<Promise<AudioBuffer>> = [];

	/**
	 *  Loads a url using fetch and returns the AudioBuffer.
	 */
	static async load(url: string): Promise<AudioBuffer> {

		// test if the url contains multiple extensions
		const matches = url.match(/\[(.+\|?)+\]$/);
		if (matches) {
			const extensions = matches[1].split("|");
			let extension = extensions[0];
			for (const ext of extensions) {
				if (ToneAudioBuffer.supportsType(ext)) {
					extension = ext;
					break;
				}
			}
			url = url.replace(matches[0], extension);
		}

		const response = await fetch(ToneAudioBuffer.baseUrl + url);
		if (!response.ok) {
			throw new Error(`could not load url: ${url}`);
		}
		const arrayBuffer = await response.arrayBuffer();

		const audioBuffer = await getContext().decodeAudioData(arrayBuffer);

		return audioBuffer;
	}

	/**
	 *  Checks a url's extension to see if the current browser can play that file type.
	 *  @param url The url/extension to test
	 *  @return If the file extension can be played
	 *  @static
	 *  @example
	 * ToneAudioBuffer.supportsType("wav"); //returns true
	 * ToneAudioBuffer.supportsType("path/to/file.wav"); //returns true
	 */
	static supportsType(url: string): boolean {
		const extensions = url.split(".");
		const extension = extensions[extensions.length - 1];
		const response = document.createElement("audio").canPlayType("audio/" + extension);
		return response !== "";
	}

	/**
	 *  Returns a Promise which resolves when all of the buffers have loaded
	 */
	static async loaded(): Promise<void> {
		for (const promise of ToneAudioBuffer.downloads) {
			await promise;
		}
	}
}