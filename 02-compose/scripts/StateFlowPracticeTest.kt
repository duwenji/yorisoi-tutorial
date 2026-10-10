package com.example.sanpoguide

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Test

// チュートリアル 2-2 のハンズオン用。終わったら消す。
class StateFlowPracticeTest {
    data class Settings(val stationId: String = "standard", val moodEnabled: Boolean = true)

    /** 比べるための、data の付いていない普通のクラス。 */
    class PlainSettings(val stationId: String = "standard")

    @Test
    fun `a StateFlow always has a current value`() {
        val settings = MutableStateFlow(Settings())
        assertEquals("standard", settings.value.stationId)
        settings.update { it.copy(stationId = "history") }
        assertEquals("history", settings.value.stationId)
    }

    @Test
    fun `setting an equal value does not notify`() = runBlocking {
        val settings = MutableStateFlow(Settings())
        val seen = mutableListOf<Settings>()
        val job = launch { settings.collect { seen += it } }
        yield()
        settings.value = Settings()                       // 中身が同じ（data class の ==）
        yield()
        settings.value = Settings(stationId = "history")  // 中身が違う
        yield()
        job.cancel()
        assertEquals(listOf("standard", "history"), seen.map { it.stationId })
    }

    @Test
    fun `a plain class is notified even when the contents are the same`() = runBlocking {
        val settings = MutableStateFlow(PlainSettings())
        val seen = mutableListOf<PlainSettings>()
        val job = launch { settings.collect { seen += it } }
        yield()
        settings.value = PlainSettings()                       // 中身は同じだが、別のインスタンス
        yield()
        settings.value = PlainSettings(stationId = "history")
        yield()
        job.cancel()
        assertEquals(listOf("standard", "standard", "history"), seen.map { it.stationId })
    }

    @Test
    fun `combine makes a value from two flows`() = runBlocking {
        val stationId = MutableStateFlow("standard")
        val names = MutableStateFlow(mapOf("standard" to "標準", "history" to "歴史探訪"))
        val label = combine(stationId, names) { id, n -> n[id] ?: "?" }
        assertEquals("標準", label.first())
        stationId.value = "history"
        assertEquals("歴史探訪", label.first())
    }
}
