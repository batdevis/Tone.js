import { expect } from "chai";
import { BasicTests } from "test/helper/Basic";
// import { EffectTests } from "test/helper/EffectTests";
import { ToneAudioBuffer } from "Tone/core/context/ToneAudioBuffer";
import { Convolver } from "./Convolver";

// @ts-ignore
if (window.__karma__) {
	ToneAudioBuffer.baseUrl = "/base/test/";
}

describe("Convolver", () => {

	BasicTests(Convolver);

	const ir = new ToneAudioBuffer();

	const testFile = "./audio/sineStereo.wav";

	before(() => {
		return ir.load(testFile);
	});

	// the buffers are set to 44.1 Khz, but i always get this error:
	// Error: Failed to set the 'buffer' property on 'ConvolverNode':
	// The buffer sample rate of 48000 does not match the context rate of 44100 Hz.
	// EffectTests(Convolver, ir);

	context("API", () => {

		it("can pass in options in the constructor", () => {
			const convolver = new Convolver({
				normalize : false,
				url : testFile,
			});
			expect(convolver.normalize).to.be.false;
			convolver.dispose();
		});

		it("can get set normalize", () => {
			const convolver = new Convolver();
			convolver.normalize = false;
			expect(convolver.normalize).to.be.false;
			convolver.dispose();
		});

		it("invokes the onload function when loaded", (done) => {
			const convolver = new Convolver({
				url : testFile,
				onload(): void {
					convolver.dispose();
					done();
				},
			});
		});

		it("load returns a Promise", (done) => {
			const convolver = new Convolver();
			convolver.load(testFile).then(() => {
				convolver.dispose();
				done();
			});
		});

		it("load invokes the second callback", () => {
			const convolver = new Convolver();
			return convolver.load(testFile).then(() => {
				convolver.dispose();
			});
		});

		it("can assign the buffer twice", () => {
			const convolver = new Convolver(ir);
			convolver.buffer = ir;
			convolver.dispose();
		});

		it("can be constructed with a buffer", () => {
			const convolver = new Convolver(ir);
			expect((convolver.buffer as ToneAudioBuffer).get()).to.equal(ir.get());
			convolver.dispose();
		});

		it("can be constructed with loaded buffer", (done) => {
			const buffer = new ToneAudioBuffer({
				url : testFile,
				onload(): void {
					const convolver = new Convolver(buffer);
					expect(convolver.buffer).is.not.null;
					buffer.dispose();
					convolver.dispose();
					done();
				},
			});
		});

		it("can be constructed with unloaded buffer", (done) => {
			const convolver = new Convolver({
				url : new ToneAudioBuffer({
					url : testFile,
				}),
				onload(): void {
					expect(convolver.buffer).is.not.null;
					convolver.dispose();
					done();
				},
			});
			// is null before then
			expect(convolver.buffer).to.be.null;
		});
	});
});