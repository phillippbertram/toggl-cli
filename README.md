# GoToggl: Empowering Your Time Tracking Workflow

Welcome to GoToggl, an open-source implementation of the Toggl Track API in Go! 

I believe that efficient time tracking is essential for productivity and success. With GoToggl, I aim to provide you with a powerful and user-friendly toolset to streamline your time tracking workflow.

## Why GoToggl?
- **Harness the Power of Go:** GoToggl is built using the robust Go programming language, ensuring high performance, reliability, and scalability. With Go's exceptional concurrency features, you can track your time with ease, even in demanding environments.

- **Open Source:** We believe in the power of collaboration and open-source development. GoToggl is released under the MIT license, giving you the freedom to use, modify, and distribute the code to suit your needs. Contribute to the project and join our vibrant community!

- **Seamless Toggl Track Integration:** GoToggl enables seamless integration with the Toggl Track API, allowing you to fetch, create, update, and delete time entries effortlessly. Gain full control over your time tracking activities and automate your workflow.

- **Advanced Features:** GoToggl goes beyond the basic Toggl Track functionality. We have added additional features such as grouping by project or client, making it easier for you to organize your time entries and gain insights into your productivity patterns.


## Usage

```shell
# Fetch all time entries
tgl entries list

# Create a new time entry
tgl entries create --description "Work on project A" --duration 2h

# Update an existing time entry
tgl entries update --id 123 --description "Updated description"

# Delete a time entry
tgl entries delete --id 123
```

## Getting Started
Getting started with GoToggl is simple. Just follow these steps:

1. Clone the GoToggl repository to your local machine.
1. Install the necessary dependencies by running go mod download.
1. Configure your API credentials in the config.json file.
1. Explore the example code provided in the examples directory to understand the usage patterns.
1. Customize GoToggl to fit your requirements and integrate it into your projects.

## Developer Information
- If you are a developer looking to contribute to GoToggl or use it in your projects, here's some essential information:

- **Installation:** Clone the GoToggl repository to your local machine. Install the necessary dependencies by running go mod download.

- **API Credentials:** Configure your Toggl Track API credentials in the config.json file. Make sure to obtain your API token from the Toggl Track website.

- **Usage:** Explore the example code provided in the examples directory to understand the usage patterns and get started quickly. You can find comprehensive documentation in the Wiki section.

- **Contributing:** We welcome contributions from the community to make GoToggl even better. Whether you find a bug, have a suggestion, or want to add a new feature, we encourage you to submit a pull request. Please refer to our contribution guidelines to get started.

## Contributing
I welcome contributions from the community to make GoToggl even better. Whether you find a bug, have a suggestion, or want to add a new feature, we encourage you to submit a pull request. Please refer to our contribution guidelines to get started.

## Support and Feedback
If you encounter any issues while using GoToggl or have any feedback, we are here to help. Feel free to open an issue on the repository, and our team will assist you as soon as possible. Your feedback is invaluable in shaping the future of GoToggl.

## License
GoToggl is released under the MIT License. See LICENSE for more information.

## Development

```
$ make build
$ go run
```

## Usage

```
# current month
$ toggl-cli times -t <API TOKEN> 

# from 2023-05-23 until today
$ toggl-cli times -t <API TOKEN> -s 2023-05-23
```