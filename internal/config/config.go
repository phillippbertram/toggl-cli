package config

import (
	"fmt"

	"github.com/spf13/viper"
)

var globalConfig *Config

type Config struct {
	Version string        `mapstructure:"version"`
	Logging LoggingConfig `mapstructure:"logging"`
	Report  ReportConfig  `mapstructure:"report"`
}

type LoggingConfig struct {
	Level string `mapstructure:"level"`
}

type ReportConfig struct {
	PricePerHour float64 `mapstructure:"pricePerHour"`
	Vat          float64 `mapstructure:"vat"`
	Currency     string  `mapstructure:"currency"`
	Start        *string
}

func LoadConfigWithViper() Config {
	var config Config = NewDefaultConfig()

	// Read the configuration file
	if err := viper.ReadInConfig(); err != nil {
		// Handle the error, e.g., config file not found
		fmt.Printf("Error reading config file: %v\n", err)
	}

	if err := viper.Unmarshal(&config); err != nil {
		fmt.Printf("Error unmarshalling config: %v\n", err)
		config = NewDefaultConfig()
	} else {
		fmt.Printf("Config loaded: %+v\n", config)
	}
	globalConfig = &config
	return config
}

func GetConfig() Config {
	return *globalConfig
}

func NewDefaultConfig() Config {
	return Config{
		Version: "1.0.0",
		Logging: LoggingConfig{
			Level: "info",
		},
		Report: ReportConfig{
			PricePerHour: 0.0,
			Vat:          0.0,
			Currency:     "EUR",
		},
	}
}
