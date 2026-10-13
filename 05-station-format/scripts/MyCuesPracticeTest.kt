package io.github.duwenji.yorisoi.core.format

import io.github.duwenji.yorisoi.core.format.material.BuiltInProducers
import io.github.duwenji.yorisoi.core.format.material.Exposure
import io.github.duwenji.yorisoi.core.format.material.Fetch
import io.github.duwenji.yorisoi.core.format.material.ProducerPolicy
import io.github.duwenji.yorisoi.core.format.material.Regions
import io.github.duwenji.yorisoi.core.format.material.Trust
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// チュートリアル 5-4 のハンズオン用。終わったら消す。
// 5-2 の「喫茶店さんぽ」に素材ときっかけを足し、アプリと同じ確認（StationValidator）にかける。
class MyCuesPracticeTest {
    private fun manifest() = JSONObject(
        """
        {
          "format": 2, "activities": ["walk"], "id": "my-cafe-walk", "version": 1,
          "name": "喫茶店さんぽ", "summary": "古い喫茶店と、そのまわりの路地を、のんびり語る", "lang": "ja",
          "greeting": "ここからは、喫茶店めぐりの気分で歩きましょう。",
          "talk": { "level": "normal",
                    "events": { "spot": true, "revisit": true, "milestone": false, "rest": true, "start": true, "finish": true } },
          "spots": { "prefer": ["historic", "garden"], "skip": ["artwork"] },
          "guide": { "length": "short" },
          "mood": { "tone": true, "sound": "auto" }
        }
        """.trimIndent(),
    )

    /** 同梱の素材: 文字が 1 つ（resources/text/intro.md）。 */
    private val intro = JSONObject().put("id", "intro").put("type", "text").put("file", "resources/text/intro.md")

    /** パッケージの外に置く音声（第 2 段）。書き起こしは intro。 */
    private val audio = JSONObject().put("id", "voice").put("type", "audio")
        .put("url", "https://cdn.example.com/cafe/voice.ogg").put("sha256", "a".repeat(64)).put("size", 1_200_000)
        .put("durationSec", 90).put("mime", "audio/ogg").put("transcript", "intro")
        .put("credit", JSONObject().put("author", "喫茶店さんぽの会").put("license", "permission"))

    /** きっかけ: 喫茶店（OSM の ID と名前）に近づいたら、present を上から順に出す。 */
    private fun cue(vararg present: JSONObject) = JSONObject().put("id", "old-cafe")
        .put("trigger", JSONObject().put("type", "spot").put("osm", "node/123456").put("name", "珈琲 古時計"))
        .put("present", JSONArray(present.toList()))

    private fun show(asWhat: String, vararg source: String) =
        JSONObject().put("as", asWhat).put("source", JSONArray(source.toList()))

    private fun channel(resources: List<JSONObject>, vararg cues: JSONObject): StationFiles {
        val json = manifest().put("resources", JSONArray(resources)).put("cues", JSONArray(cues.toList()))
        return MemoryStationFiles(
            mapOf(
                "channel.json" to json.toString(2).toByteArray(),
                "resources/text/intro.md" to "昭和の初めから続く店です。柱時計が今も時を刻んでいます。\n".toByteArray(),
            ),
        )
    }

    private fun check(files: StationFiles, stage: Int) = StationValidator.check(files, StationOrigin.BUILT_IN, mediaStage = stage)

    private fun code(result: StationCheck) = (result as StationCheck.Rejected).code.also { println("rejected: $result") }

    @Test
    fun `a text cue passes at stage 1 with the AI as a fallback`() {
        val result = check(channel(listOf(intro), cue(show("speak", "self#intro", "builtin:ai-guide", "builtin:fallback-text"))), stage = 1)
        assertTrue("rejected: $result", result is StationCheck.Ok)
        val media = (result as StationCheck.Ok).station.media
        println(media.cues.single())
        assertEquals(1, MediaStage.required(media))
    }

    @Test
    fun `an audio cue needs stage 2 - the app turns it away, the review tools don't`() {
        val files = channel(listOf(intro, audio), cue(show("play", "self#voice")))
        assertEquals(RejectCode.UNSUPPORTED_RESOURCE, code(check(files, stage = 1)))
        val all = check(files, stage = StationValidator.ALL_STAGES) as StationCheck.Ok
        assertEquals(2, MediaStage.required(all.station.media))
    }

    @Test
    fun `a card can't show audio`() {
        assertEquals(RejectCode.BAD_CUE, code(check(channel(listOf(intro, audio), cue(show("card", "self#voice"))), StationValidator.ALL_STAGES)))
    }

    @Test
    fun `a collection that isn't declared can't be named`() {
        assertEquals(RejectCode.UNRESOLVED_REFERENCE, code(check(channel(listOf(intro), cue(show("speak", "kamakura#intro"))), stage = 1)))
    }

    @Test
    fun `only the app's own producers may fetch when shown`() {
        BuiltInProducers.all.forEach { assertNull(ProducerPolicy.violation(it)) }
        val thirdParty = BuiltInProducers.COMMONS_PHOTO.copy(id = "collection:my-photos", trust = Trust.REVIEWED)
        println(ProducerPolicy.violation(thirdParty))
        assertEquals(null, ProducerPolicy.violation(thirdParty.copy(fetch = Fetch.PREFETCH, exposure = Exposure.NONE)))
    }

    @Test
    fun `the region of a spot and the eight around it`() {
        val here = Regions.geohash(35.3260, 139.5565)   // 鶴岡八幡宮のあたり
        val around = Regions.around(35.3260, 139.5565)
        println("$here ${around.sorted()}")
        assertEquals(3, here.length)
        assertEquals(9, around.size)
        assertTrue(here in around)
    }
}
