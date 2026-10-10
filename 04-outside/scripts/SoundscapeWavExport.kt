package com.example.sanpoguide.sound

import org.junit.Test
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream

// チュートリアル 4-4 のハンズオン用。終わったら消す。
// 散策ガイドの背景音を、端末と同じコード（Voices）で合成し、WAV ファイルに書き出す。
class SoundscapeWavExport {
    private val sampleRate = 22_050
    private val seconds = 15
    private val gain = 0.8f // AmbientPlayer の MAX_GAIN と同じ

    @Test
    fun `write every soundscape to a wav file`() {
        val out = File("build/soundscapes").apply { mkdirs() }
        for (scape in Soundscape.entries) {
            val voice = Voices.create(scape, sampleRate, seed = 1L)
            val samples = ShortArray(sampleRate * seconds) {
                (voice.next() * gain * Short.MAX_VALUE).toInt().coerceIn(-32767, 32767).toShort()
            }
            writeWav(File(out, "${scape.name.lowercase()}.wav"), samples)
            println("${scape.label} -> ${File(out, "${scape.name.lowercase()}.wav").absolutePath}")
        }
    }

    /** 16-bit mono PCM WAV. */
    private fun writeWav(file: File, samples: ShortArray) {
        val dataBytes = samples.size * 2
        DataOutputStream(FileOutputStream(file).buffered()).use { out ->
            fun intLE(v: Int) = out.write(byteArrayOf(v.toByte(), (v shr 8).toByte(), (v shr 16).toByte(), (v shr 24).toByte()))
            fun shortLE(v: Int) = out.write(byteArrayOf(v.toByte(), (v shr 8).toByte()))
            out.writeBytes("RIFF"); intLE(36 + dataBytes); out.writeBytes("WAVE")
            out.writeBytes("fmt "); intLE(16); shortLE(1); shortLE(1); intLE(sampleRate); intLE(sampleRate * 2); shortLE(2); shortLE(16)
            out.writeBytes("data"); intLE(dataBytes)
            for (s in samples) shortLE(s.toInt())
        }
    }
}
