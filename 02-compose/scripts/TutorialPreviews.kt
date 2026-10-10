package com.example.sanpoguide.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.tooling.preview.Preview
import com.example.sanpoguide.companion.LiveWalk
import com.example.sanpoguide.companion.Utterance
import com.example.sanpoguide.mood.Mood
import com.example.sanpoguide.mood.Place
import com.example.sanpoguide.mood.Season
import com.example.sanpoguide.mood.Sky
import com.example.sanpoguide.mood.TimeOfDay

// チュートリアル 2-1・2-4 のハンズオン用。終わったら消す。
private val sampleLines = listOf(
    Utterance(at = 1_700_000_000_000, text = "鶴岡八幡宮の大石段が見えてきました。源実朝ゆかりの場所です。", spotName = "鶴岡八幡宮"),
    Utterance(at = 1_699_999_000_000, text = "いってらっしゃい。近くに来たらお知らせします"),
)
private val sampleWalk = LiveWalk(startedAt = System.currentTimeMillis() - 25 * 60_000, distanceM = 1800.0, spotCount = 2)

@Preview(name = "雰囲気なし", widthDp = 360)
@Composable
private fun CompanionCardPlain() {
    MoodTheme(mood = null, systemDark = false) {
        CompanionCard(live = sampleWalk, lines = sampleLines)
    }
}

@Preview(name = "秋の夕方・寺社", widthDp = 360)
@Composable
private fun CompanionCardAutumnEvening() {
    val mood = Mood(TimeOfDay.EVENING, Season.AUTUMN, place = Place.SHRINE_TEMPLE)
    MoodTheme(mood = mood, systemDark = false) {
        CompanionCard(live = sampleWalk, lines = sampleLines, scene = mood)
    }
}

@Preview(name = "夏の昼・雨", widthDp = 360)
@Composable
private fun CompanionCardSummerRain() {
    val mood = Mood(TimeOfDay.DAY, Season.SUMMER, sky = Sky.RAIN)
    MoodTheme(mood = mood, systemDark = false) {
        CompanionCard(live = sampleWalk, lines = sampleLines, scene = mood)
    }
}

@Preview(name = "冬の夜", widthDp = 360)
@Composable
private fun CompanionCardWinterNight() {
    val mood = Mood(TimeOfDay.NIGHT, Season.WINTER)
    MoodTheme(mood = mood, systemDark = false) {
        CompanionCard(live = null, lines = emptyList(), scene = mood)
    }
}
