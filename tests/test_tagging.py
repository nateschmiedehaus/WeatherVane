from shared.libs.tagging import TextTagger


def test_text_tagger_weather_and_intent():
    tagger = TextTagger()
    text = "Summer rain sale on waterproof jackets for loyal members"
    weather_tags = tagger.suggest_weather_tags(text)
    season_tags = tagger.suggest_season_tags(text)
    intent_tags = tagger.suggest_intent_tags(text)

    assert "Rain" in weather_tags
    assert "Summer" in season_tags
    assert "Loyalty" in intent_tags
