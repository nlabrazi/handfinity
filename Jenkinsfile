
@Library('nabster-ci') _

pipeline {
    agent {
        docker {
            image 'node:24-bookworm'
        }
    }

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    stages {
        stage('Notify start') {
            steps {
                notifyTelegram('started')
            }
        }

        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Lint') {
            steps {
                sh 'npm run lint'
            }
        }

        stage('Format check') {
            steps {
                sh 'npm run format:check'
            }
        }

        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }
    }

    post {
        success {
            notifyTelegram('success')
        }

        failure {
            notifyTelegram('failed')
        }
    }
}
