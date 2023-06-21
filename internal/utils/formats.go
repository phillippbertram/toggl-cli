package utils

import (
	"fmt"
	"time"
)

// convert duration into decimal hours
func DurationToHours(duration time.Duration) float64 {
	return float64(duration) / float64(time.Hour)
}

func FormatDuration(duration time.Duration) string {
	return fmt.Sprintf("%.2f", DurationToHours(duration))
}
